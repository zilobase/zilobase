import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conflictOptions: [] as unknown[],
  deleteWhere: [] as unknown[],
  insertedValues: [] as unknown[],
  limitRows: [] as Array<{ id: string }>,
  selectCalls: 0,
}));

vi.mock("../db", () => ({
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
  },
}));

import { syncAiChatThreadMessages } from "./chat-persistence";

beforeEach(() => {
  mocks.conflictOptions.length = 0;
  mocks.deleteWhere.length = 0;
  mocks.insertedValues.length = 0;
  mocks.limitRows = [];
  mocks.selectCalls = 0;
});

function message(id: string, role: "assistant" | "user", text: string) {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  } as UIMessage;
}

test("syncAiChatThreadMessages bulk upserts persistable messages", async () => {
  await syncAiChatThreadMessages("thread-1", [
    message("message-1", "user", "Question"),
    message("message-2", "assistant", "Answer"),
  ]);

  assert.equal(mocks.insertedValues.length, 1);
  assert.equal(mocks.conflictOptions.length, 1);
  assert.equal((mocks.insertedValues[0] as unknown[]).length, 2);
  assert.deepEqual(
    (mocks.insertedValues[0] as Array<Record<string, unknown>>).map(
      ({ id, role, threadId }) => ({ id, role, threadId }),
    ),
    [
      { id: "message-1", role: "user", threadId: "thread-1" },
      { id: "message-2", role: "assistant", threadId: "thread-1" },
    ],
  );
  assert.equal(mocks.selectCalls, 1);
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
