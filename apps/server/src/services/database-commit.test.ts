import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("./database-realtime", () => ({
  publishDatabaseRealtimeEvent: mocks.publish,
}));

import {
  commitDatabaseMutation,
  commitDatabaseMutationBatch,
  DatabaseMutationError,
  mutationResponse,
} from "./database-commit";

function transactionExecutor(versions: Array<number | null>) {
  let insertCalls = 0;
  const outbox: unknown[] = [];
  let updateCalls = 0;
  const tx = {
    insert() {
      return {
        async values(value: unknown) {
          insertCalls += 1;
          outbox.push(...(Array.isArray(value) ? value : [value]));
        },
      };
    },
    update() {
      updateCalls += 1;
      return {
        set() {
          return {
            where() {
              return {
                async returning() {
                  const version = versions.shift();
                  return version === null || version === undefined
                    ? []
                    : [{ version }];
                },
              };
            },
          };
        },
      };
    },
  };

  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return {
    get insertCalls() { return insertCalls; },
    outbox,
    tx,
    get updateCalls() { return updateCalls; },
  };
}

beforeEach(() => {
  mocks.publish.mockReset();
  mocks.transaction.mockReset();
  vi.restoreAllMocks();
});

test("commitDatabaseMutationBatch versions, bulk persists, and publishes each mutation", async () => {
  const transaction = transactionExecutor([3, 9]);
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1", env: { DATABASE_URL: "unused" } },
    async () => ({
      mutations: [
        {
          changed: ["database"],
          databaseId: "database-1",
          delta: { database: { name: "First" } },
        },
        {
          changed: ["rows"],
          databaseId: "database-2",
          delta: { rows: [{ id: "row-1" }] },
        },
      ],
      result: "saved",
    }),
  );

  assert.equal(result.result, "saved");
  assert.deepEqual(
    result.commits.map(({ databaseId, mutationId, version }) => ({
      databaseId,
      mutationId,
      version,
    })),
    [
      {
        databaseId: "database-1",
        mutationId: "00000000-0000-4000-8000-000000000001",
        version: 3,
      },
      {
        databaseId: "database-2",
        mutationId: "00000000-0000-4000-8000-000000000002",
        version: 9,
      },
    ],
  );
  assert.equal(transaction.updateCalls, 2);
  assert.equal(transaction.insertCalls, 1);
  assert.equal(transaction.outbox.length, 2);
  assert.ok(
    (transaction.outbox[0] as { committedAt: unknown }).committedAt instanceof Date,
  );
  assert.equal(mocks.publish.mock.calls.length, 2);
  assert.deepEqual(mocks.publish.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["database"],
    committedAt: result.commits[0]?.committedAt,
    databaseId: "database-1",
    delta: { database: { name: "First" } },
    mutationId: "00000000-0000-4000-8000-000000000001",
    protocolVersion: 1,
    type: "database.mutation",
    version: 3,
  });
});

test("same-database batches reserve contiguous versions with one update", async () => {
  const transaction = transactionExecutor([12]);

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1" },
    async () => ({
      mutations: ["database", "rows", "values"].map((area) => ({
        changed: [area] as Array<"database" | "rows" | "values">,
        databaseId: "database-1",
        delta: {},
      })),
      result: "saved",
    }),
  );

  assert.deepEqual(result.commits.map(({ version }) => version), [10, 11, 12]);
  assert.equal(transaction.updateCalls, 1);
  assert.equal(transaction.insertCalls, 1);
  assert.deepEqual(
    transaction.outbox.map((row) => (row as { version: number }).version),
    [10, 11, 12],
  );
});

test("empty batches avoid version and outbox writes", async () => {
  const transaction = transactionExecutor([]);

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1" },
    async () => ({ mutations: [], result: "unchanged" }),
  );

  assert.deepEqual(result, { commits: [], result: "unchanged" });
  assert.equal(transaction.updateCalls, 0);
  assert.equal(transaction.insertCalls, 0);
});

test("large commits persist invalidate-only payloads", async () => {
  const { outbox } = transactionExecutor([2]);

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1" },
    async () => ({
      mutations: [
        {
          changed: ["values"],
          databaseId: "database-1",
          delta: { database: { value: "x".repeat(70_000) } },
        },
      ],
      result: undefined,
    }),
  );

  assert.equal(result.commits[0]?.requiresRefetch, true);
  assert.deepEqual(result.commits[0]?.delta, {});
  assert.deepEqual(
    (outbox[0] as { delta: unknown; requiresRefetch: boolean }).delta,
    {},
  );
  assert.equal(
    (outbox[0] as { requiresRefetch: boolean }).requiresRefetch,
    true,
  );
  assert.equal(mocks.publish.mock.calls.length, 0);
});

test("immediate publish failures are logged without rolling back commits", async () => {
  transactionExecutor([4]);
  mocks.publish.mockRejectedValue(new Error("room unavailable"));
  const errorLog = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1", env: {} },
    async () => ({
      mutations: [
        {
          changed: ["views"],
          databaseId: "database-1",
          delta: { views: [] },
        },
      ],
      result: true,
    }),
  );

  assert.equal(result.commits[0]?.version, 4);
  assert.deepEqual(JSON.parse(String(errorLog.mock.calls[0]?.[0])), {
    databaseId: "database-1",
    error: "room unavailable",
    event: "database_realtime_immediate_publish_failed",
    mutationId: result.commits[0]?.mutationId,
    version: 4,
  });
});

test("missing databases abort mutation commits with a typed 404", async () => {
  transactionExecutor([null]);

  await assert.rejects(
    commitDatabaseMutationBatch({ actorId: "user-1" }, async () => ({
      mutations: [
        {
          changed: ["rows"],
          databaseId: "missing",
          delta: {},
        },
      ],
      result: undefined,
    })),
    (error: unknown) =>
      error instanceof DatabaseMutationError &&
      error.message === "Database not found" &&
      error.status === 404 &&
      error.name === "DatabaseMutationError",
  );
});

test("single mutation commits and response mapping preserve metadata", async () => {
  transactionExecutor([7]);

  const commit = await commitDatabaseMutation(
    {
      actorId: "user-1",
      changed: ["properties"],
      databaseId: "database-1",
    },
    async () => ({ delta: { properties: [{ id: "property-1" }] } }),
  );

  assert.deepEqual(mutationResponse(commit), {
    changed: ["properties"],
    committedAt: commit.committedAt,
    databaseId: "database-1",
    delta: { properties: [{ id: "property-1" }] },
    mutationId: commit.mutationId,
    version: 7,
  });
});

test("single mutation guard rejects an impossible empty batch result", async () => {
  mocks.transaction.mockResolvedValue({ commits: [], result: undefined });

  await assert.rejects(
    commitDatabaseMutation(
      {
        actorId: "user-1",
        changed: ["database"],
        databaseId: "database-1",
      },
      async () => ({ delta: {} }),
    ),
    /Database mutation did not produce a commit/,
  );
});
