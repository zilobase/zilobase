import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteCalls: 0,
  operations: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../../infrastructure/database", () => ({
  db: {
    delete() {
      return {
        where: async () => {
          mocks.deleteCalls += 1;
        },
      };
    },
    insert() {
      return {
        values(value: Record<string, unknown>) {
          return {
            onConflictDoNothing() {
              let inserted = false;
              if (!mocks.operations.some((operation) => operation.id === value.id)) {
                mocks.operations.push({ createdAt: new Date(), updatedAt: new Date(), ...value });
                inserted = true;
              }
              return {
                async returning() {
                  return inserted ? [{ id: value.id }] : [];
                },
              };
            },
          };
        },
      };
    },
    select() {
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: async () => mocks.operations,
      };
      return builder;
    },
    update() {
      let update: Record<string, unknown> = {};
      const apply = () => {
        if (mocks.operations[0]) Object.assign(mocks.operations[0], update);
      };
      return {
        set(value: Record<string, unknown>) {
          update = value;
          return {
            where() {
              apply();
              return {
                then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(undefined)),
                async returning() {
                  return [{ id: mocks.operations[0]?.id }];
                },
              };
            },
          };
        },
      };
    },
  },
}));

import { cleanupExpiredGmailSendOperations, sendGmailComposition } from "./mail-compose";
import {
  GmailApiError,
  type GmailConnectionRow,
  type GmailGateway,
} from "../provider/gmail-gateway";

const connection = {
  email: "sender@example.com",
  id: "connection-1",
  userId: "user-1",
} as GmailConnectionRow;
const compose = {
  attachments: [],
  bcc: [],
  bodyText: "Hello",
  cc: [],
  clientOperationId: "operation_123456",
  subject: "Hello",
  to: [{ address: "person@example.com", name: null }],
};

beforeEach(() => {
  mocks.deleteCalls = 0;
  mocks.operations = [];
});

test("successful sends are deduplicated by stable client operation and RFC message IDs", async () => {
  let sends = 0;
  const gateway = fakeGateway({
    async listMessages() {
      return { messages: [] };
    },
    async sendMessage() {
      sends += 1;
      return { id: "sent-1" };
    },
  });

  const first = await sendGmailComposition({ compose, connection, gateway, userId: "user-1" });
  const second = await sendGmailComposition({ compose, connection, gateway, userId: "user-1" });

  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(sends, 1);
  assert.equal(mocks.operations[0]?.status, "sent");
  assert.equal(mocks.operations[0]?.rfcMessageId, "<zilobase.operation_123456@example.com>");
});

test("ambiguous provider failures search Sent mail before allowing any retry", async () => {
  let searches = 0;
  const gateway = fakeGateway({
    async listMessages() {
      searches += 1;
      return { messages: searches === 1 ? [] : [{ id: "recovered-1" }] };
    },
    async sendMessage() {
      throw new GmailApiError("timeout", 504, "provider_error", true);
    },
  });

  const result = await sendGmailComposition({ compose, connection, gateway, userId: "user-1" });
  assert.equal(result.reused, true);
  assert.equal(mocks.operations[0]?.gmailMessageId, "recovered-1");
  assert.equal(searches, 2);
});

test("expired send receipts have a metadata-only cleanup path", async () => {
  mocks.operations = [{ id: "expired" }];
  await cleanupExpiredGmailSendOperations(new Date("2026-08-30T00:00:00Z"));
  assert.equal(mocks.deleteCalls, 1);
});

test("draft delivery retains the provider draft route", async () => {
  const calls: string[] = [];
  const gateway = fakeGateway({
    async listMessages() {
      return { messages: [] };
    },
    async sendDraft(id) {
      calls.push(id);
      return { id: "sent-draft" };
    },
    async sendMessage() {
      throw new Error("Unexpected direct send");
    },
  });
  const result = await sendGmailComposition({
    compose,
    connection,
    gateway,
    userId: "user-1",
    draftId: "draft-1",
  });
  assert.deepEqual(calls, ["draft-1"]);
  assert.equal(result.reused, false);
  assert.equal(result.messageId, "sent-draft");
});

test("a receipt cannot be reused by a different user or connection", async () => {
  const gateway = fakeGateway({
    async listMessages() {
      return { messages: [] };
    },
    async sendMessage() {
      return { id: "sent" };
    },
  });
  await sendGmailComposition({ compose, connection, gateway, userId: "user-1" });
  for (const change of [{ userId: "other" }, { connection: { ...connection, id: "other" } }]) {
    await assert.rejects(
      sendGmailComposition({ compose, connection, gateway, userId: "user-1", ...change }),
      /operation ID is already in use/,
    );
  }
});

test("fresh and stale pending receipts never replay uncertain delivery", async () => {
  let sends = 0;
  mocks.operations = [
    {
      id: compose.clientOperationId,
      connectionId: connection.id,
      userId: "user-1",
      status: "pending",
      rfcMessageId: "<zilobase.operation_123456@example.com>",
      updatedAt: new Date(),
    },
  ];
  const gateway = fakeGateway({
    async listMessages() {
      return { messages: [] };
    },
    async sendMessage() {
      sends += 1;
      return { id: "sent" };
    },
  });
  await assert.rejects(
    sendGmailComposition({ compose, connection, gateway, userId: "user-1" }),
    /still being sent/,
  );
  assert.equal(sends, 0);
  mocks.operations[0]!.updatedAt = new Date(Date.now() - 121_000);
  await assert.rejects(
    sendGmailComposition({ compose, connection, gateway, userId: "user-1" }),
    /still being sent/,
  );
  assert.equal(sends, 0);
});

test("unrecovered ambiguous sends retain a receipt for the next attempt", async () => {
  const failure = new GmailApiError("timeout", 504, "provider_error", true);
  const gateway = fakeGateway({
    async listMessages() {
      return { messages: [] };
    },
    async sendMessage() {
      throw failure;
    },
  });
  await assert.rejects(
    sendGmailComposition({ compose, connection, gateway, userId: "user-1" }),
    (error) => error === failure,
  );
  assert.equal(mocks.operations[0]!.status, "ambiguous");
  const recovered = await sendGmailComposition({
    compose,
    connection,
    gateway: fakeGateway({
      ...gateway,
      async listMessages() {
        return { messages: [{ id: "eventually-sent" }] };
      },
    }),
    userId: "user-1",
  });
  assert.equal(recovered.reused, true);
  assert.equal(mocks.operations[0]!.status, "sent");
});

test("definite provider failures are recorded and remain retryable by receipt claim", async () => {
  const failure = new GmailApiError("rejected", 400, "provider_error");
  const gateway = fakeGateway({
    async listMessages() {
      return { messages: [] };
    },
    async sendMessage() {
      throw failure;
    },
  });
  await assert.rejects(
    sendGmailComposition({ compose, connection, gateway, userId: "user-1" }),
    (error) => error === failure,
  );
  assert.equal(mocks.operations[0]!.status, "failed");
  const sent = await sendGmailComposition({
    compose,
    connection,
    gateway: fakeGateway({
      ...gateway,
      async sendMessage() {
        return { id: "retried" };
      },
    }),
    userId: "user-1",
  });
  assert.equal(sent.reused, false);
  assert.equal(mocks.operations[0]!.status, "sent");
});

function fakeGateway(overrides: Partial<GmailGateway>) {
  return {
    async updateDraft(id: string) {
      return { id, message: await this.getMessage("draft-message") };
    },
    async getMessage(id: string) {
      return {
        historyId: "2",
        id,
        internalDate: "1788084000000",
        labelIds: ["SENT"],
        payload: {
          headers: [
            { name: "From", value: "sender@example.com" },
            { name: "To", value: "person@example.com" },
            { name: "Subject", value: "Hello" },
            { name: "Message-ID", value: "<zilobase.operation_123456@example.com>" },
          ],
        },
        snippet: "Hello",
        threadId: "thread-1",
      };
    },
    ...overrides,
  } as GmailGateway;
}

test("draft retries recover a successful receipt before updating the deleted draft", async () => {
  let updates = 0;
  const gateway = fakeGateway({
    async listMessages() {
      return { messages: [] };
    },
    async updateDraft(id) {
      if (++updates > 1) throw new Error("draft was deleted");
      return { id, message: { id: "draft-message", threadId: "thread", payload: {} } };
    },
    async sendDraft() {
      return { id: "sent" };
    },
  });
  const input = { compose, connection, gateway, userId: "user-1", draftId: "draft" };
  await sendGmailComposition(input);
  assert.equal((await sendGmailComposition(input)).reused, true);
  assert.equal(updates, 1);
  await assert.rejects(
    sendGmailComposition({ ...input, compose: { ...compose, bodyText: "changed" } }),
    /cannot be changed/,
  );
});

test("failed message hydration cannot turn accepted delivery into a failed receipt", async () => {
  const gateway = fakeGateway({
    async listMessages() {
      return { messages: [] };
    },
    async sendMessage() {
      return { id: "sent" };
    },
    async getMessage() {
      throw new Error("read outage");
    },
  });
  const response = await sendGmailComposition({ compose, connection, gateway, userId: "user-1" });
  assert.equal(response.messageId, "sent");
  assert.equal(response.message, null);
  assert.equal(mocks.operations[0].status, "sent");
});
