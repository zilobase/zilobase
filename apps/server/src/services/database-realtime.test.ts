import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { runWithRuntimeAdapter } from "../runtime-adapter";
import type { DatabaseRealtimeMutationEvent } from "./database-delta";
import {
  drainDatabaseRealtimeOutbox,
  publishDatabaseRealtimeEvent,
} from "./database-realtime";

const event: DatabaseRealtimeMutationEvent = {
  actorId: "user-1",
  changed: ["rows"],
  committedAt: "2026-08-02T00:00:00.000Z",
  databaseId: "database-1",
  delta: { rows: [{ id: "row-1" }] },
  mutationId: "mutation-1",
  protocolVersion: 1,
  type: "database.mutation",
  version: 3,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function writeExecutor() {
  const deleted: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  return {
    deleted,
    executor: {
      delete() {
        return {
          async where() {
            deleted.push("deleted");
          },
        };
      },
      update() {
        return {
          set(value: Record<string, unknown>) {
            updates.push(value);
            return { async where() {} };
          },
        };
      },
    },
    updates,
  };
}

test("immediate realtime publish reports an unavailable adapter", async () => {
  assert.equal(await publishDatabaseRealtimeEvent(event, {}, {} as never), false);
});

test("immediate realtime publish deletes delivered outbox entries", async () => {
  const publish = vi.fn(async (_input: unknown) => undefined);
  const { deleted, executor } = writeExecutor();

  const result = await runWithRuntimeAdapter(
    { publishDatabaseMutation: publish },
    () => publishDatabaseRealtimeEvent(event, { ENV: "test" }, executor as never),
  );

  assert.equal(result, true);
  assert.equal(publish.mock.calls.length, 1);
  assert.deepEqual(publish.mock.calls[0]?.[0], {
    env: { ENV: "test" },
    event,
  });
  assert.deepEqual(deleted, ["deleted"]);
});

test("immediate realtime failures schedule the first retry and rethrow", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
  const failure = new Error("room unavailable");
  const { executor, updates } = writeExecutor();

  await assert.rejects(
    runWithRuntimeAdapter(
      { publishDatabaseMutation: async () => { throw failure; } },
      () => publishDatabaseRealtimeEvent(event, {}, executor as never),
    ),
    failure,
  );
  assert.deepEqual(updates, [
    {
      attempts: 1,
      lastAttemptAt: new Date("2026-08-02T00:00:00.000Z"),
      nextAttemptAt: new Date("2026-08-02T00:01:00.000Z"),
    },
  ]);
});

test("outbox draining is a no-op without a publish adapter", async () => {
  assert.deepEqual(await drainDatabaseRealtimeOutbox({}, { database: {} as never }), {
    backlog: 0,
    delivered: 0,
    discarded: 0,
    failed: 0,
    maxAttempts: 0,
    oldestAgeMs: 0,
  });
});

function drainExecutor(
  ready: Array<Record<string, any>>,
  health?: Record<string, unknown>,
) {
  const deleted: string[] = [];
  const retryUpdates: Array<Record<string, unknown>> = [];
  let claimedLimit: number | undefined;
  let claimed = false;
  const transactionUpdate = {
    set() {
      return {
        async where() {
          claimed = true;
        },
      };
    },
  };
  const executor = {
    async transaction(callback: (tx: unknown) => unknown) {
      const select = {
        from() {
          return {
            where() {
              return {
                orderBy() {
                  return {
                    limit(limit: number) {
                      claimedLimit = limit;
                      return { async for() { return ready; } };
                    },
                  };
                },
              };
            },
          };
        },
      };
      return callback({ select: () => select, update: () => transactionUpdate });
    },
    delete() {
      return {
        async where() {
          deleted.push("deleted");
        },
      };
    },
    select() {
      return {
        async from() {
          return health ? [health] : [];
        },
      };
    },
    update() {
      return {
        set(value: Record<string, unknown>) {
          retryUpdates.push(value);
          return { async where() {} };
        },
      };
    },
  };

  return {
    deleted,
    executor,
    get claimed() { return claimed; },
    get claimedLimit() { return claimedLimit; },
    retryUpdates,
  };
}

test("outbox draining claims bounded batches and reports empty health", async () => {
  const state = drainExecutor([]);
  const publish = vi.fn(async (_input: unknown) => undefined);

  const result = await runWithRuntimeAdapter(
    { publishDatabaseMutation: publish },
    () =>
      drainDatabaseRealtimeOutbox({}, {
        database: state.executor as never,
        limit: 5_000,
      }),
  );

  assert.equal(state.claimedLimit, 500);
  assert.equal(state.claimed, false);
  assert.equal(publish.mock.calls.length, 0);
  assert.deepEqual(result, {
    backlog: 0,
    delivered: 0,
    discarded: 0,
    failed: 0,
    maxAttempts: 0,
    oldestAgeMs: 0,
  });
});

test("outbox draining delivers, retries, discards, and reports health", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T00:10:00.000Z"));
  const committedAt = new Date("2026-08-02T00:00:00.000Z");
  const state = drainExecutor(
    [
      { ...event, attempts: 0, committedAt, id: "delivered", requiresRefetch: false },
      { ...event, attempts: 0, committedAt, id: "retry", requiresRefetch: true },
      { ...event, attempts: 7, committedAt, id: "discard", requiresRefetch: false },
    ],
    { backlog: 2, maxAttempts: 4, oldestCommittedAt: committedAt },
  );
  const publish = vi
    .fn((_input: any) => Promise.resolve())
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("temporary"))
    .mockRejectedValueOnce("permanent");
  const errorLog = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  const result = await runWithRuntimeAdapter(
    { publishDatabaseMutation: publish },
    () =>
      drainDatabaseRealtimeOutbox({ ENV: "test" }, {
        database: state.executor as never,
        limit: 0,
      }),
  );

  assert.equal(state.claimedLimit, 1);
  assert.equal(state.claimed, true);
  assert.equal(state.deleted.length, 1);
  assert.deepEqual(state.retryUpdates, [
    { nextAttemptAt: new Date("2026-08-02T00:11:00.000Z") },
  ]);
  assert.deepEqual(result, {
    backlog: 2,
    delivered: 1,
    discarded: 1,
    failed: 2,
    maxAttempts: 4,
    oldestAgeMs: 600_000,
  });
  assert.equal(publish.mock.calls[1]?.[0].event.requiresRefetch, true);
  assert.equal(publish.mock.calls[0]?.[0].event.committedAt, committedAt.toISOString());
  assert.equal(errorLog.mock.calls.length, 2);
  assert.equal(
    JSON.parse(String(errorLog.mock.calls[1]?.[0])).event,
    "database_realtime_publish_discarded",
  );
});

test("outbox draining groups retries by backoff attempt", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
  const committedAt = new Date("2026-08-02T00:00:00.000Z");
  const state = drainExecutor([
    { ...event, attempts: 0, committedAt, id: "retry-1" },
    { ...event, attempts: 0, committedAt, id: "retry-2" },
    { ...event, attempts: 1, committedAt, id: "retry-3" },
  ]);
  const errorLog = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  const result = await runWithRuntimeAdapter(
    { publishDatabaseMutation: async () => { throw new Error("temporary"); } },
    () =>
      drainDatabaseRealtimeOutbox({}, {
        database: state.executor as never,
      }),
  );

  assert.equal(state.deleted.length, 0);
  assert.deepEqual(state.retryUpdates, [
    { nextAttemptAt: new Date("2026-08-02T00:01:00.000Z") },
    { nextAttemptAt: new Date("2026-08-02T00:02:00.000Z") },
  ]);
  assert.equal(result.failed, 3);
  assert.equal(errorLog.mock.calls.length, 3);
});
