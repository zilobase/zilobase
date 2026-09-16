import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { runWithRuntimeAdapter } from "../../../infrastructure/runtime/runtime-adapter";
import {
  drainDatabaseRealtimeOutbox,
  publishCommittedDataSourceMutations,
} from "./outbox";
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

function committedSourceEvent(eventId: string, sourceVersion: number) {
  return {
    actorId: "user-1",
    areas: ["records" as const],
    changes: { removedRecordIds: ["row-1"] },
    commandId: "command-1",
    committedAt: "2026-09-16T00:00:00.000Z",
    eventId,
    protocolVersion: 3 as const,
    sourceId: "source-1",
    sourceVersion,
    type: "database.mutation" as const,
  };
}

test("hot publication is ordered and deletes successful outbox rows", async () => {
  const published: number[] = [];
  const deleted: string[] = [];
  const executor = {
    delete() {
      return {
        async where(value: unknown) {
          assert.ok(value);
          deleted.push("deleted");
        },
      };
    },
  };
  const retryEventIds = await runWithRuntimeAdapter(
    {
      publishDatabaseMutation: async ({ event }) => {
        published.push(event.sourceVersion);
      },
    },
    () => publishCommittedDataSourceMutations(
      {},
      [committedSourceEvent("event-2", 2), committedSourceEvent("event-3", 3)],
      executor as never,
    ),
  );

  assert.deepEqual(published, [2, 3]);
  assert.deepEqual(deleted, ["deleted", "deleted"]);
  assert.deepEqual(retryEventIds, []);
});

test("hot publication leaves failed events in the outbox for retry", async () => {
  const executor = { delete: vi.fn() };
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const retryEventIds = await runWithRuntimeAdapter(
    {
      publishDatabaseMutation: async () => {
        throw new Error("room unavailable");
      },
    },
    () => publishCommittedDataSourceMutations(
      {},
      [committedSourceEvent("event-2", 2)],
      executor as never,
    ),
  );

  assert.deepEqual(retryEventIds, ["event-2"]);
  assert.equal(executor.delete.mock.calls.length, 0);
  assert.match(String(warning.mock.calls[0]?.[0]), /hot_publish_failed/);
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
    databaseId: null,
    dataSourceId: "source-1",
    id: entry.eventId,
    protocolVersion: 3,
    requiresReset: entry.requiresRefetch,
    sourceId: "source-1",
    streamKind: "source",
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

test("journal-backed deliveries publish the canonical v3 source event", async () => {
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
      databaseId: null,
      dataSourceId: "source-1",
      id: "journal-1",
      protocolVersion: 3,
      requiresReset: false,
      sourceId: "source-1",
      streamKind: "source",
      version: 9,
    }],
  );
  const publish = vi.fn(async (_input: unknown) => undefined);
  await runWithRuntimeAdapter(
    { publishDatabaseMutation: publish },
    () => drainDatabaseRealtimeOutbox({}, { database: state.executor as never }),
  );
  assert.deepEqual((publish.mock.calls[0]?.[0] as { event: unknown }).event, {
    actorId: "user-2",
    areas: ["records"],
    changes: { removedRecordIds: ["row-1"] },
    commandId: "command-1",
    committedAt: committedAt.toISOString(),
    eventId: "journal-1",
    protocolVersion: 3,
    sourceId: "source-1",
    sourceVersion: 9,
    type: "database.mutation",
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

  const result = await runWithRuntimeAdapter(
    { publishDatabaseMutation: publish },
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
