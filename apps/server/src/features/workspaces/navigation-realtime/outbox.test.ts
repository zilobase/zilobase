import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { runWithRuntimeAdapter } from "../../../infrastructure/runtime/runtime-adapter";
import {
  drainNavigationRealtimeOutbox,
  enqueueNavigationInvalidation,
  publishNavigationInvalidation,
  toNavigationRealtimeEvent,
} from "./outbox";

const event = {
  committedAt: "2026-09-01T00:00:00.000Z",
  eventId: "event-1",
  protocolVersion: 1 as const,
  type: "navigation.invalidate" as const,
  workspaceId: "workspace-1",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("enqueue writes only generic workspace invalidation metadata", async () => {
  const inserted: unknown[] = [];
  const tx = {
    insert() {
      return { async values(value: unknown) { inserted.push(value); } };
    },
  };
  const committedAt = new Date(event.committedAt);
  const row = await enqueueNavigationInvalidation(tx as never, event.workspaceId, {
    committedAt,
    eventId: event.eventId,
  });

  assert.deepEqual(row, {
    committedAt,
    id: event.eventId,
    workspaceId: event.workspaceId,
  });
  assert.deepEqual(inserted, [row]);
  assert.deepEqual(toNavigationRealtimeEvent(row), event);
});

test("immediate publication deletes delivered events", async () => {
  const deleted: string[] = [];
  const executor = {
    delete() { return { async where() { deleted.push("deleted"); } }; },
    update() { return { set() { return { async where() {} }; } }; },
  };
  const publish = vi.fn(async () => undefined);

  assert.equal(await runWithRuntimeAdapter(
    { publishNavigationInvalidation: publish },
    () => publishNavigationInvalidation(event, { ENV: "test" }, executor as never),
  ), true);
  assert.equal(publish.mock.calls.length, 1);
  assert.deepEqual(deleted, ["deleted"]);
});

test("failed immediate publication retains the event and schedules retry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(event.committedAt));
  const updates: unknown[] = [];
  const executor = {
    delete() { return { async where() {} }; },
    update() {
      return {
        set(value: unknown) {
          updates.push(value);
          return { async where() {} };
        },
      };
    },
  };

  await assert.rejects(runWithRuntimeAdapter(
    { publishNavigationInvalidation: async () => { throw new Error("offline"); } },
    () => publishNavigationInvalidation(event, {}, executor as never),
  ), /offline/);
  assert.deepEqual(updates, [{
    attempts: 1,
    lastAttemptAt: new Date("2026-09-01T00:00:00.000Z"),
    nextAttemptAt: new Date("2026-09-01T00:01:00.000Z"),
  }]);
});

test("scheduled drain retries a retained event", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T00:10:00.000Z"));
  const committedAt = new Date(event.committedAt);
  const retryUpdates: unknown[] = [];
  const executor = {
    async transaction(callback: (tx: unknown) => Promise<unknown>) {
      return callback({
        select() {
          return { from() { return { where() { return { orderBy() { return {
            limit() { return { async for() { return [{
              attempts: 0,
              committedAt,
              id: event.eventId,
              workspaceId: event.workspaceId,
            }]; } }; },
          }; } }; } }; } };
        },
        update() { return { set() { return { async where() {} }; } }; },
      });
    },
    delete() { return { async where() {} }; },
    select() { return { async from() { return [{ backlog: 1, maxAttempts: 1, oldestCommittedAt: committedAt }]; } }; },
    update() {
      return {
        set(value: unknown) {
          retryUpdates.push(value);
          return { async where() {} };
        },
      };
    },
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  const result = await runWithRuntimeAdapter(
    { publishNavigationInvalidation: async () => { throw new Error("offline"); } },
    () => drainNavigationRealtimeOutbox({}, { database: executor as never }),
  );

  assert.equal(result.failed, 1);
  assert.deepEqual(retryUpdates, [{
    nextAttemptAt: new Date("2026-09-01T00:11:00.000Z"),
  }]);
});
