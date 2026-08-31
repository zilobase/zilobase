import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conflictOptions: [] as unknown[],
  deleteWhere: [] as unknown[],
  insertedValues: [] as unknown[],
  limitRows: [] as Array<{ id: string }>,
  selectCalls: 0,
  threadUpdates: [] as unknown[],
}));

vi.mock("../../../infrastructure/database", () => ({
  db: {
    delete() {
      return {
        async where(value: unknown) {
          mocks.deleteWhere.push(value);
        },
      };
    },
    insert() {
      return {
        values(value: unknown) {
          mocks.insertedValues.push(value);
          return {
            async onConflictDoUpdate(options: unknown) {
              mocks.conflictOptions.push(options);
            },
          };
        },
      };
    },
    select() {
      mocks.selectCalls += 1;
      const builder = {
        from() { return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        async offset() { return mocks.limitRows; },
      };
      return builder;
    },
    update() {
      return {
        set(value: unknown) {
          mocks.threadUpdates.push(value);
          return { async where() {} };
        },
      };
    },
  },
}));

import {
  selectCanonicalAssistantMessages,
  syncAiChatThreadMessages,
} from "./chat-persistence";

beforeEach(() => {
  mocks.conflictOptions.length = 0;
  mocks.deleteWhere.length = 0;
  mocks.insertedValues.length = 0;
  mocks.limitRows = [];
  mocks.selectCalls = 0;
  mocks.threadUpdates.length = 0;
});

function message(id: string, role: "assistant" | "user", text: string) {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  } as UIMessage;
}

test("canonical assistant selection accepts response-only finish payloads", () => {
  const assistant = message("assistant-1", "assistant", "Answer");

  assert.deepEqual(
    selectCanonicalAssistantMessages([assistant], "user-1"),
    [assistant],
  );
});

test("canonical assistant selection ignores history before the submitted user", () => {
  const currentAssistant = message("assistant-2", "assistant", "Current answer");

  assert.deepEqual(
    selectCanonicalAssistantMessages([
      message("user-0", "user", "Old question"),
      message("assistant-0", "assistant", "Old answer"),
      message("user-1", "user", "Current question"),
      currentAssistant,
    ], "user-1"),
    [currentAssistant],
  );
});

test("syncAiChatThreadMessages bulk upserts persistable messages", async () => {
  await syncAiChatThreadMessages("thread-1", [
    message("message-1", "user", "Question"),
    message("message-2", "assistant", "Answer"),
  ]);

  assert.equal(mocks.insertedValues.length, 1);
  assert.equal(mocks.conflictOptions.length, 1);
  const conflict = mocks.conflictOptions[0] as {
    set: { clientId: unknown; parts: unknown; role: unknown; sequence: unknown };
    target: Array<{ name: string }>;
  };
  const dialect = new PgDialect();
  assert.deepEqual(conflict.target.map((column) => column.name), [
    "thread_id",
    "sequence",
  ]);
  assert.equal(
    dialect.sqlToQuery(conflict.set.clientId as never).sql,
    'coalesce("ai_chat_message"."client_id", excluded."client_id")',
  );
  assert.equal(
    dialect.sqlToQuery(conflict.set.role as never).sql,
    'excluded."role"',
  );
  assert.equal(
    dialect.sqlToQuery(conflict.set.parts as never).sql,
    'excluded."parts"',
  );
  assert.equal(
    dialect.sqlToQuery(conflict.set.sequence as never).sql,
    'excluded."sequence"',
  );
  assert.equal((mocks.insertedValues[0] as unknown[]).length, 2);
  assert.deepEqual(
    (mocks.insertedValues[0] as Array<Record<string, unknown>>).map(
      ({ clientId, id, role, threadId }) => ({ clientId, id, role, threadId }),
    ),
    [
      {
        clientId: "message-1",
        id: "message-1",
        role: "user",
        threadId: "thread-1",
      },
      {
        clientId: "message-2",
        id: "message-2",
        role: "assistant",
        threadId: "thread-1",
      },
    ],
  );
  assert.equal(mocks.selectCalls, 1);
  assert.equal(mocks.threadUpdates.length, 1);
  const threadUpdate = mocks.threadUpdates[0] as {
    nextMessageSequence: unknown;
  };
  assert.equal(
    dialect.sqlToQuery(threadUpdate.nextMessageSequence as never).sql,
    'greatest("ai_chat_thread"."next_message_sequence", $1)',
  );
});

test("syncAiChatThreadMessages deduplicates IDs with last-message-wins semantics", async () => {
  await syncAiChatThreadMessages("thread-1", [
    message("message-1", "user", "Original"),
    message("message-1", "assistant", "Replacement"),
    { id: "", role: "user", parts: [] } as UIMessage,
  ]);

  const values = mocks.insertedValues[0] as Array<Record<string, unknown>>;
  assert.equal(values.length, 1);
  assert.equal(values[0]?.role, "assistant");
  assert.deepEqual(values[0]?.parts, [
    { type: "text", text: "Replacement" },
  ]);
});

test("syncAiChatThreadMessages deletes stale and over-limit rows", async () => {
  mocks.limitRows = [{ id: "old-1" }, { id: "old-2" }];

  await syncAiChatThreadMessages(
    "thread-1",
    [message("message-1", "user", "Keep")],
    { deleteStaleRows: true },
  );

  assert.equal(mocks.deleteWhere.length, 2);
  assert.equal(mocks.selectCalls, 1);
});

test("syncAiChatThreadMessages handles empty snapshots without retention queries", async () => {
  await syncAiChatThreadMessages("thread-1", [], {
    deleteStaleRows: true,
  });

  assert.equal(mocks.deleteWhere.length, 1);
  assert.equal(mocks.insertedValues.length, 0);
  assert.equal(mocks.selectCalls, 0);

  mocks.deleteWhere.length = 0;
  await syncAiChatThreadMessages("thread-1", []);
  assert.equal(mocks.deleteWhere.length, 0);
});
