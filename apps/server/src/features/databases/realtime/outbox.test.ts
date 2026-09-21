import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { drainDatabaseRealtimeOutbox } from "./outbox";
import {
  databaseMutationEvent,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema";

const event = {
  actorId: "user-1",
  changed: ["rows"],
  committedAt: new Date("2026-08-02T00:00:00.000Z"),
  databaseId: "database-1",
  delta: { rows: [{ id: "row-1" }] },
  id: "mutation-1",
  requiresRefetch: false,
  version: 3,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function withFanout<T>(
  publish: (input: { event: unknown }) => void | Promise<void>,
  operation: () => T,
) {
  return runWithRuntimePorts({
    fanout: {
      publish: (_channel, event) => Promise.resolve(publish({ event })),
      subscribe: async () => () => {},
    },
  }, operation);
}

test("outbox draining requires a fanout provider", async () => {
  await assert.rejects(
    () => runWithRuntimePorts({}, () =>
      drainDatabaseRealtimeOutbox({}, { database: {} as never })),
    /Runtime fanout port is required/,
  );
});

function drainExecutor(
  ready: Array<Record<string, any>>,
  health?: Record<string, unknown>,
  journal?: Array<Record<string, unknown>>,
) {
  const readyWithEventIds: Array<Record<string, any>> = ready.map((entry) => ({
    ...entry,
    eventId: entry.eventId ?? entry.id,
  }));
  const journalRows = journal ?? readyWithEventIds.map((entry) => ({
    actorId: entry.actorId,
    areas: ["records"],
    changes: { removedRecordIds: [`row-${entry.id}`] },
    commandId: entry.id,
    committedAt: entry.committedAt,
    databaseId: entry.databaseId,
    dataSourceId: "source-1",
    id: entry.eventId,
    protocolVersion: 2,
    requiresReset: entry.requiresRefetch,
    version: entry.version,
  }));
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
                      return { async for() { return readyWithEventIds; } };
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
        from(table: unknown) {
          if (table === databaseMutationEvent) {
            return { async where() { return journalRows; } };
          }
          assert.equal(table, databaseRealtimeOutbox);
          return Promise.resolve(health ? [health] : []);
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

  const result = await withFanout(
    publish,
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

test("journal-backed deliveries publish the canonical v2 event", async () => {
  const committedAt = new Date("2026-08-02T00:00:00.000Z");
  const state = drainExecutor(
    [{ ...event, attempts: 0, committedAt, eventId: "journal-1", id: "delivery-1" }],
    {},
    [{
      actorId: "user-2",
      areas: ["records"],
      changes: { removedRecordIds: ["row-1"] },
      commandId: "command-1",
      committedAt,
      databaseId: "database-1",
      dataSourceId: "source-1",
      id: "journal-1",
      protocolVersion: 2,
      requiresReset: false,
      version: 9,
    }],
  );
  const publish = vi.fn(async (_input: unknown) => undefined);
  await withFanout(
    publish,
    () => drainDatabaseRealtimeOutbox({}, { database: state.executor as never }),
  );
  assert.deepEqual((publish.mock.calls[0]?.[0] as { event: unknown }).event, {
    actorId: "user-2",
    areas: ["records"],
    changes: { removedRecordIds: ["row-1"] },
    commandId: "command-1",
    committedAt: committedAt.toISOString(),
    databaseId: "database-1",
    dataSourceId: "source-1",
    eventId: "journal-1",
    protocolVersion: 2,
    type: "database.mutation",
    version: 9,
  });
});

test("outbox delivery retries when its journal event is unavailable", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T00:10:00.000Z"));
  const state = drainExecutor(
    [{ ...event, attempts: 0, eventId: "missing", id: "delivery-1" }],
    {},
    [],
  );
  const publish = vi.fn(async (_input: unknown) => undefined);
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const result = await withFanout(
    publish,
    () => drainDatabaseRealtimeOutbox({}, { database: state.executor as never }),
  );

  assert.equal(publish.mock.calls.length, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(state.retryUpdates, [
    { nextAttemptAt: new Date("2026-08-02T00:11:00.000Z") },
  ]);
  assert.match(String(errorLog.mock.calls[0]?.[0]), /journal event is unavailable/);
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
    { backlog: 2, maxAttempts: 4, oldestReadyAt: committedAt },
  );
  const publish = vi
    .fn((_input: any) => Promise.resolve())
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("temporary"))
    .mockRejectedValueOnce("permanent");
  const errorLog = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  const result = await withFanout(
    publish,
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
  assert.equal(publish.mock.calls[1]?.[0].event.requiresReset, true);
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

  const result = await withFanout(
    async () => { throw new Error("temporary"); },
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
