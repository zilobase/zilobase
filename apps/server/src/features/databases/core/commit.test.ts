import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  dispatch: vi.fn(),
  publish: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../../infrastructure/database", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("../../../infrastructure/background/dispatch", () => ({
  dispatchBackgroundTasks: mocks.dispatch,
}));
vi.mock("../automations/triggers/event-capture", () => ({
  captureDatabaseAutomationMutationFacts: mocks.capture,
}));

import {
  commitDatabaseMutation,
  commitDatabaseMutationBatch,
  commitDataSourceMutation,
  commitDataSourceMutationBatch,
  DatabaseMutationError,
} from "./commit";
import {
  databaseMutationEvent,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema";

function transactionExecutor(versions: Array<number | null>) {
  let insertCalls = 0;
  const journal: unknown[] = [];
  const outbox: unknown[] = [];
  let updateCalls = 0;
  const tx = {
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          insertCalls += 1;
          const target = table === databaseRealtimeOutbox
            ? outbox
            : table === databaseMutationEvent
              ? journal
              : [];
          target.push(...(Array.isArray(value) ? value : [value]));
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
                    : [{ parentDatabaseId: "database-owner", version }];
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
    journal,
    outbox,
    tx,
    get updateCalls() { return updateCalls; },
  };
}

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.capture.mockResolvedValue(0);
  mocks.dispatch.mockReset();
  mocks.dispatch.mockResolvedValue(true);
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
          areas: ["databases"],
          databaseId: "database-1",
          changes: {},
        },
        {
          areas: ["records"],
          databaseId: "database-2",
          changes: {},
        },
      ],
      result: "saved",
    }),
  );

  assert.equal(result.result, "saved");
  assert.deepEqual(
    result.commits.map(({ databaseId, eventId, version }) => ({
      databaseId,
      eventId,
      version,
    })),
    [
      {
        databaseId: "database-1",
        eventId: "00000000-0000-4000-8000-000000000001",
        version: 3,
      },
      {
        databaseId: "database-2",
        eventId: "00000000-0000-4000-8000-000000000002",
        version: 9,
      },
    ],
  );
  assert.equal(transaction.updateCalls, 2);
  assert.equal(transaction.insertCalls, 2);
  assert.equal(transaction.outbox.length, 2);
  assert.equal(transaction.journal.length, 2);
  assert.equal(
    (transaction.outbox[0] as { eventId: string }).eventId,
    (transaction.journal[0] as { id: string }).id,
  );
  assert.deepEqual(Object.keys(transaction.outbox[0] as object).sort(), [
    "eventId",
    "id",
  ]);
  assert.equal(mocks.publish.mock.calls.length, 0);
  assert.deepEqual(
    mocks.dispatch.mock.calls[0]?.[1].map((task: { kind: string; resourceId: string }) => ({
      kind: task.kind,
      resourceId: task.resourceId,
    })),
    [
      { kind: "realtime.database", resourceId: "00000000-0000-4000-8000-000000000001" },
      { kind: "realtime.database", resourceId: "00000000-0000-4000-8000-000000000002" },
    ],
  );
});

test("same-database batches reserve contiguous versions with one update", async () => {
  const transaction = transactionExecutor([12]);

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1" },
    async () => ({
      mutations: ["databases", "records", "properties"].map((area) => ({
        areas: [area] as Array<"databases" | "records" | "properties">,
        databaseId: "database-1",
        changes: {},
      })),
      result: "saved",
    }),
  );

  assert.deepEqual(result.commits.map(({ version }) => version), [10, 11, 12]);
  assert.equal(transaction.updateCalls, 1);
  assert.equal(transaction.insertCalls, 2);
  assert.deepEqual(
    transaction.outbox.map((row) => (row as { eventId: string }).eventId),
    transaction.journal.map((row) => (row as { id: string }).id),
  );
  assert.deepEqual(
    transaction.journal.map((row) => (row as { version: number }).version),
    [10, 11, 12],
  );
});

test("multi-database batches reserve locks deterministically and preserve commit order", async () => {
  const transaction = transactionExecutor([5, 12]);

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1" },
    async () => ({
      mutations: ["database-b", "database-a", "database-b"].map(
        (databaseId) => ({ areas: ["records"] as const, databaseId, changes: {} }),
      ),
      result: undefined,
    }),
  );

  assert.deepEqual(
    result.commits.map(({ databaseId, version }) => ({ databaseId, version })),
    [
      { databaseId: "database-b", version: 11 },
      { databaseId: "database-a", version: 5 },
      { databaseId: "database-b", version: 12 },
    ],
  );
  assert.equal(transaction.updateCalls, 2);
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

test("automation facts are captured inside the commit transaction and abort atomically", async () => {
  const transaction = transactionExecutor([2]);
  const facts = [
    {
      actorId: "user-1",
      changedValues: [{ after: "Done", before: "Todo", propertyId: "status" }],
      dataSourceId: "source-1",
      origin: "user" as const,
      pageId: "page-1",
      rowId: "row-1",
    },
  ];
  mocks.capture.mockRejectedValueOnce(new Error("capture failed"));

  await assert.rejects(
    commitDatabaseMutationBatch({ actorId: "user-1" }, async () => ({
      automationFacts: facts,
      mutations: [
        { areas: ["records"], databaseId: "database-1", changes: {} },
      ],
      result: undefined,
    })),
    /capture failed/,
  );

  assert.deepEqual(mocks.capture.mock.calls[0], [transaction.tx, facts]);
  assert.equal(transaction.updateCalls, 0);
  assert.equal(transaction.insertCalls, 0);
  assert.equal(mocks.publish.mock.calls.length, 0);
});

test("large commits persist reset events with reference-only delivery", async () => {
  const { journal, outbox } = transactionExecutor([2]);

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1" },
    async () => ({
      mutations: [
        {
          areas: ["records"],
          databaseId: "database-1",
          changes: {
            removedRecordIds: Array.from(
              { length: 700 },
              (_, index) => `${index}-${"x".repeat(110)}`,
            ),
          },
        },
      ],
      result: undefined,
    }),
  );

  assert.equal(result.commits[0]?.requiresReset, true);
  assert.deepEqual(result.commits[0]?.changes, {});
  assert.equal((journal[0] as { requiresReset: boolean }).requiresReset, true);
  assert.deepEqual(Object.keys(outbox[0] as object).sort(), ["eventId", "id"]);
  assert.equal(mocks.publish.mock.calls.length, 0);
});

test("background enqueue failures leave the committed outbox available for recovery", async () => {
  transactionExecutor([4]);
  mocks.dispatch.mockResolvedValue(false);

  const result = await commitDatabaseMutationBatch(
    { actorId: "user-1", env: {} },
    async () => ({
      mutations: [
        {
          areas: ["views"],
          databaseId: "database-1",
          changes: { views: [] },
        },
      ],
      result: true,
    }),
  );

  assert.equal(result.commits[0]?.version, 4);
  assert.equal(mocks.dispatch.mock.calls.length, 1);
  assert.equal(mocks.publish.mock.calls.length, 0);
});

test("missing databases abort mutation commits with a typed 404", async () => {
  transactionExecutor([null]);

  await assert.rejects(
    commitDatabaseMutationBatch({ actorId: "user-1" }, async () => ({
      mutations: [
        {
          areas: ["records"],
          databaseId: "missing",
          changes: {},
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

test("single mutation exposes its canonical v2 event", async () => {
  transactionExecutor([7]);

  const commit = await commitDatabaseMutation(
    {
      actorId: "user-1",
      areas: ["properties"],
      databaseId: "database-1",
    },
    async () => ({ changes: { removedPropertyIds: ["property-1"] } }),
  );

  assert.deepEqual(commit, {
    actorId: "user-1",
    areas: ["properties"],
    changes: { removedPropertyIds: ["property-1"] },
    commandId: commit.eventId,
    committedAt: commit.committedAt,
    databaseId: "database-1",
    dataSourceId: null,
    eventId: commit.eventId,
    protocolVersion: 2,
    type: "database.mutation",
    version: 7,
  });
});

test("source mutations persist one v3 event without enumerating linking hosts", async () => {
  const transaction = transactionExecutor([8]);

  const commit = await commitDataSourceMutation(
    {
      actorId: "user-1",
      areas: ["records"],
      dataSourceId: "source-1",
    },
    async () => ({
      changes: (databaseId: string) => {
        assert.equal(databaseId, "database-owner");
        return Promise.resolve({ removedRecordIds: ["row-1"] });
      },
    }),
  );

  assert.deepEqual(commit, {
    actorId: "user-1",
    areas: ["records"],
    changes: { removedRecordIds: ["row-1"] },
    commandId: commit.eventId,
    committedAt: commit.committedAt,
    eventId: commit.eventId,
    protocolVersion: 3,
    sourceId: "source-1",
    sourceVersion: 8,
    type: "database.mutation",
  });
  assert.equal(transaction.journal.length, 1);
  assert.deepEqual(transaction.journal[0], {
    actorId: "user-1",
    areas: ["records"],
    changes: { removedRecordIds: ["row-1"] },
    commandId: commit.commandId,
    committedAt: new Date(commit.committedAt),
    databaseId: null,
    dataSourceId: "source-1",
    id: commit.eventId,
    protocolVersion: 3,
    requiresReset: false,
    sourceId: "source-1",
    streamKind: "source",
    version: 8,
  });
  assert.equal(transaction.outbox.length, 1);
  assert.equal(transaction.updateCalls, 1);
});

test("source batches reserve contiguous versions per source", async () => {
  const transaction = transactionExecutor([4, 12]);

  const result = await commitDataSourceMutationBatch(
    { actorId: "user-1" },
    async () => ({
      mutations: [
        {
          areas: ["records"] as const,
          changes: { removedRecordIds: ["row-1"] },
          dataSourceId: "source-b",
        },
        {
          areas: ["properties"] as const,
          changes: { removedPropertyIds: ["property-1"] },
          dataSourceId: "source-a",
        },
        {
          areas: ["records"] as const,
          changes: { removedRecordIds: ["row-2"] },
          dataSourceId: "source-b",
        },
      ],
      result: "moved",
    }),
  );

  assert.equal(result.result, "moved");
  assert.deepEqual(
    result.commits.map(({ sourceId, sourceVersion }) => ({
      sourceId,
      sourceVersion,
    })),
    [
      { sourceId: "source-b", sourceVersion: 11 },
      { sourceId: "source-a", sourceVersion: 4 },
      { sourceId: "source-b", sourceVersion: 12 },
    ],
  );
  assert.equal(transaction.updateCalls, 2);
  assert.equal(transaction.journal.length, 3);
  assert.equal(transaction.outbox.length, 3);
});

test("source metadata strips host link placement and uses the committed version", async () => {
  transactionExecutor([9]);
  const now = "2026-09-16T10:00:00.000Z";

  const commit = await commitDataSourceMutation(
    {
      actorId: "user-1",
      areas: ["dataSources"],
      dataSourceId: "source-1",
    },
    async () => ({
      changes: {
        dataSources: [{
          config: {},
          configVersion: 2,
          createdAt: now,
          id: "source-1",
          linkedAt: now,
          name: "Tasks",
          parentDatabaseId: "database-owner",
          position: 4,
          updatedAt: now,
          version: 3,
          workspaceId: "workspace-1",
        }],
      },
    }),
  );

  assert.deepEqual(commit.areas, ["source"]);
  assert.deepEqual(commit.changes.source, {
    config: {},
    configVersion: 2,
    createdAt: now,
    id: "source-1",
    name: "Tasks",
    parentDatabaseId: "database-owner",
    updatedAt: now,
    version: 9,
    workspaceId: "workspace-1",
  });
  assert.equal("linkedAt" in commit.changes.source!, false);
  assert.equal("position" in commit.changes.source!, false);
});

test("single mutation guard rejects an impossible empty batch result", async () => {
  mocks.transaction.mockResolvedValue({ commits: [], result: undefined });

  await assert.rejects(
    commitDatabaseMutation(
      {
        actorId: "user-1",
        areas: ["databases"],
        databaseId: "database-1",
      },
      async () => ({ changes: {} }),
    ),
    /Database mutation did not produce a commit/,
  );
});
