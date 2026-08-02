import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canAccessDatabase: vi.fn(),
  canAccessPage: vi.fn(),
  commit: vi.fn(),
  getRecord: vi.fn(),
  getMembership: vi.fn(),
  payload: vi.fn(),
  placement: vi.fn(),
  requireAccess: vi.fn(),
  select: vi.fn(),
  selectResults: [] as unknown[][],
  softDelete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../access", () => ({
  canAccessDatabaseInWorkspace: mocks.canAccessDatabase,
  canAccessPage: mocks.canAccessPage,
  getMembership: mocks.getMembership,
}));
vi.mock("./database-access", () => ({
  getDatabaseRecord: mocks.getRecord,
  requireDatabaseEditAccess: mocks.requireAccess,
}));
vi.mock("./database-commit", () => ({
  commitDatabaseMutation: mocks.commit,
}));
vi.mock("../page-item-placements", () => ({
  upsertPageItemPlacement: mocks.placement,
}));
vi.mock("../soft-delete-nav-items", () => ({
  softDeleteDatabaseTree: mocks.softDelete,
}));
vi.mock("./database-payload", () => ({
  getDatabasePayload: mocks.payload,
}));
vi.mock("../db", () => ({
  db: {
    select() {
      mocks.select();
      const builder = {
        from() { return builder; },
        where() { return builder; },
        async limit() { return mocks.selectResults.shift() ?? []; },
      };
      return builder;
    },
    transaction: mocks.transaction,
  },
}));

import {
  createDatabaseService,
  deleteDatabaseService,
  restoreDatabaseService,
  updateDatabaseService,
} from "./database-service";
import { ServiceMutationError } from "./mutation-error";

beforeEach(() => {
  mocks.canAccessDatabase.mockReset();
  mocks.canAccessDatabase.mockResolvedValue(true);
  mocks.canAccessPage.mockReset();
  mocks.canAccessPage.mockResolvedValue(true);
  mocks.commit.mockReset();
  mocks.getRecord.mockReset();
  mocks.getMembership.mockReset();
  mocks.getMembership.mockResolvedValue(true);
  mocks.payload.mockReset();
  mocks.placement.mockReset();
  mocks.requireAccess.mockReset();
  mocks.requireAccess.mockResolvedValue({ id: "database-1" });
  mocks.select.mockReset();
  mocks.selectResults = [];
  mocks.softDelete.mockReset();
  mocks.transaction.mockReset();
  vi.restoreAllMocks();
});

function transactionRecorder() {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    insert() {
      return {
        values(value: unknown) {
          inserts.push(value);
          return { async onConflictDoNothing() {} };
        },
      };
    },
    update() {
      return {
        set(value: unknown) {
          updates.push(value);
          return { async where() {} };
        },
      };
    },
  };
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.commit.mockImplementation(async (_options, mutate) => mutate(tx));
  return { inserts, tx, updates };
}

function restoreTransactionRecorder(returningResults: unknown[][]) {
  const updates: unknown[] = [];
  const tx = {
    update() {
      return {
        set(value: unknown) {
          updates.push(value);
          const builder = {
            where() { return builder; },
            async returning() { return returningResults.shift() ?? []; },
          };
          return builder;
        },
      };
    },
  };
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return { updates };
}

test("createDatabaseService creates database, default view, and placement atomically", async () => {
  const { inserts, tx } = transactionRecorder();
  mocks.selectResults = [[{ id: "page-1" }], []];
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000003");

  const result = await createDatabaseService({
    name: " Roadmap ",
    pageId: "page-1",
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.deepEqual(result, {
    databaseId: "00000000-0000-4000-8000-000000000001",
    defaultViewId: "00000000-0000-4000-8000-000000000002",
    name: "Roadmap",
    pageId: "page-1",
    parentPlacement: {
      id: "00000000-0000-4000-8000-000000000003",
      itemId: "00000000-0000-4000-8000-000000000001",
      itemKind: "database",
      parentId: "page-1",
      parentKind: "page",
      placementKind: "primary",
      position: 0,
      sourceRowId: null,
      workspaceId: "workspace-1",
    },
  });
  assert.deepEqual(inserts, [
    {
      config: {},
      createdById: "user-1",
      id: "00000000-0000-4000-8000-000000000001",
      name: "Roadmap",
      pageId: "page-1",
      workspaceId: "workspace-1",
    },
    {
      databaseId: "00000000-0000-4000-8000-000000000001",
      id: "00000000-0000-4000-8000-000000000002",
      name: "Table",
      position: 0,
      type: "table",
    },
  ]);
  assert.deepEqual(mocks.placement.mock.calls[0], [
    tx,
    {
      id: "00000000-0000-4000-8000-000000000003",
      itemId: "00000000-0000-4000-8000-000000000001",
      itemKind: "database",
      parentId: "page-1",
      parentKind: "page",
      placementKind: "primary",
      workspaceId: "workspace-1",
    },
  ]);
  assert.deepEqual(mocks.canAccessPage.mock.calls[0], [
    "page-1",
    "user-1",
    "edit",
  ]);
});

test("createDatabaseService applies the default name", async () => {
  transactionRecorder();
  mocks.selectResults = [[{ id: "page-1" }], []];

  const result = await createDatabaseService({
    name: " ",
    pageId: "page-1",
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.equal(result.name, "New database");
});

test("createDatabaseService distinguishes missing and forbidden pages", async () => {
  mocks.selectResults = [[]];
  await assert.rejects(
    createDatabaseService({
      pageId: "missing",
      userId: "user-1",
      workspaceId: "workspace-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.selectResults = [[{ id: "page-1" }]];
  mocks.canAccessPage.mockResolvedValue(false);
  await assert.rejects(
    createDatabaseService({
      pageId: "page-1",
      userId: "user-1",
      workspaceId: "workspace-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 403,
  );
});

test("createDatabaseService skips parent reads and placement for standalone databases", async () => {
  const { inserts } = transactionRecorder();
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");

  const result = await createDatabaseService({
    standalone: true,
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.equal(mocks.select.mock.calls.length, 0);
  assert.equal(mocks.placement.mock.calls.length, 0);
  assert.deepEqual(mocks.getMembership.mock.calls[0], [
    "workspace-1",
    "user-1",
  ]);
  assert.deepEqual(result, {
    databaseId: "00000000-0000-4000-8000-000000000001",
    defaultViewId: "00000000-0000-4000-8000-000000000002",
    name: "New database",
    pageId: null,
    parentPlacement: null,
  });
  assert.equal(inserts.length, 2);
  assert.equal((inserts[0] as { pageId: unknown }).pageId, null);
});

test("createDatabaseService rejects standalone creation outside the workspace", async () => {
  mocks.getMembership.mockResolvedValue(false);

  await assert.rejects(
    createDatabaseService({
      standalone: true,
      userId: "user-1",
      workspaceId: "workspace-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 403,
  );

  assert.equal(mocks.transaction.mock.calls.length, 0);
});

test("createDatabaseService inherits the parent page favorite", async () => {
  const { inserts } = transactionRecorder();
  mocks.selectResults = [[{ id: "page-1" }], [{ id: "favorite-1" }]];
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000003")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000004");

  await createDatabaseService({
    pageId: "page-1",
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.deepEqual(inserts[2], {
    databaseId: "00000000-0000-4000-8000-000000000001",
    id: "00000000-0000-4000-8000-000000000004",
    userId: "user-1",
  });
});

test("updateDatabaseService commits supplied metadata", async () => {
  const { updates } = transactionRecorder();

  const result = await updateDatabaseService({
    config: { icon: "table" },
    databaseId: "database-1",
    env: { ENV: "test" },
    name: "Updated",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    commit: await mocks.commit.mock.results[0]?.value,
    databaseId: "database-1",
  });
  assert.deepEqual(updates[0], {
    config: { icon: "table" },
    name: "Updated",
    updatedAt: (updates[0] as Record<string, unknown>).updatedAt,
  });
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["database"],
    databaseId: "database-1",
    env: { ENV: "test" },
  });
  assert.deepEqual((await mocks.commit.mock.results[0]?.value)?.delta.database, {
    config: { icon: "table" },
    id: "database-1",
    name: "Updated",
    updatedAt: (updates[0] as Record<string, unknown>).updatedAt,
  });
});

test("updateDatabaseService permits a timestamp-only touch", async () => {
  const { updates } = transactionRecorder();
  await updateDatabaseService({
    databaseId: "database-1",
    userId: "user-1",
  });

  assert.deepEqual(Object.keys(updates[0] as object), ["updatedAt"]);
});

test("deleteDatabaseService returns the deleted record without reloading it", async () => {
  const deletedAt = new Date("2026-08-03T00:00:00.000Z");
  const updatedAt = new Date("2026-08-02T00:00:00.000Z");
  mocks.getRecord.mockResolvedValue({
    deletedAt: null,
    deletedById: null,
    id: "database-1",
    updatedAt,
    workspaceId: "workspace-1",
  });
  mocks.softDelete.mockResolvedValue({
    deletedAt,
    deletedDatabaseIds: ["database-1", "database-2"],
    deletedPageIds: ["page-1"],
  });

  const result = await deleteDatabaseService({
    databaseId: "database-1",
    userId: "user-1",
  });

  assert.deepEqual(mocks.canAccessDatabase.mock.calls[0], [
    "database-1",
    "workspace-1",
    "user-1",
    "full",
  ]);
  assert.deepEqual(result, {
    database: {
      deletedAt,
      deletedById: "user-1",
      id: "database-1",
      updatedAt: deletedAt,
      workspaceId: "workspace-1",
    },
    deletedDatabaseIds: ["database-1", "database-2"],
    deletedPageIds: ["page-1"],
  });
});

test("deleteDatabaseService rejects missing and forbidden databases", async () => {
  await assert.rejects(
    deleteDatabaseService({
      databaseId: "missing",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.getRecord.mockResolvedValue({
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.canAccessDatabase.mockResolvedValue(false);
  await assert.rejects(
    deleteDatabaseService({
      databaseId: "database-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 403,
  );

  assert.equal(mocks.softDelete.mock.calls.length, 0);
});

test("restoreDatabaseService returns an active database without writing", async () => {
  const existing = {
    deletedAt: null,
    id: "database-1",
    workspaceId: "workspace-1",
  };
  const restoredDatabase = { ...existing, isFavorite: true };
  mocks.getRecord.mockResolvedValue(existing);
  mocks.payload.mockResolvedValue({ database: restoredDatabase });

  const result = await restoreDatabaseService({
    databaseId: "database-1",
    userId: "user-1",
  });

  assert.deepEqual(mocks.getRecord.mock.calls[0], ["database-1", {
    includeDeleted: true,
  }]);
  assert.equal(mocks.transaction.mock.calls.length, 0);
  assert.deepEqual(result, {
    database: restoredDatabase,
    restoredDatabaseIds: [],
    restoredPageIds: [],
  });
});

test("restoreDatabaseService falls back to the active database record", async () => {
  const existing = {
    deletedAt: null,
    id: "database-1",
    workspaceId: "workspace-1",
  };
  mocks.getRecord.mockResolvedValue(existing);
  mocks.payload.mockResolvedValue(null);

  const result = await restoreDatabaseService({
    databaseId: "database-1",
    userId: "user-1",
  });

  assert.deepEqual(result.database, existing);
});

test("restoreDatabaseService restores the deletion batch without reloading the root", async () => {
  const deletedAt = new Date("2026-08-03T00:00:00.000Z");
  const existing = {
    deletedAt,
    deletedById: "user-1",
    id: "database-1",
    updatedAt: deletedAt,
    workspaceId: "workspace-1",
  };
  const { updates } = restoreTransactionRecorder([
    [{ id: "database-1" }, { id: "database-2" }],
    [{ id: "page-1" }],
  ]);
  mocks.getRecord.mockResolvedValue(existing);
  mocks.payload.mockResolvedValue({
    database: { id: "database-1", isFavorite: false },
  });

  const result = await restoreDatabaseService({
    databaseId: "database-1",
    userId: "user-1",
  });

  assert.equal(updates.length, 3);
  const restoredAt = (updates[0] as { updatedAt: Date }).updatedAt;
  assert.deepEqual(mocks.payload.mock.calls[0], [
    "database-1",
    "user-1",
    {
      ...existing,
      deletedAt: null,
      deletedById: null,
      updatedAt: restoredAt,
    },
    { includeDeleted: true },
  ]);
  assert.deepEqual(result, {
    database: { id: "database-1", isFavorite: false },
    restoredDatabaseIds: ["database-1", "database-2"],
    restoredPageIds: ["page-1"],
  });
});

test("restoreDatabaseService rejects missing or inaccessible databases", async () => {
  await assert.rejects(
    restoreDatabaseService({
      databaseId: "missing",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.getRecord.mockResolvedValue({
    deletedAt: new Date(),
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.getMembership.mockResolvedValue(false);
  await assert.rejects(
    restoreDatabaseService({
      databaseId: "database-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 403,
  );

  assert.equal(mocks.transaction.mock.calls.length, 0);
});

test("restoreDatabaseService rejects a missing post-restore payload", async () => {
  const deletedAt = new Date("2026-08-03T00:00:00.000Z");
  const { updates } = restoreTransactionRecorder([[], []]);
  mocks.getRecord.mockResolvedValue({
    deletedAt,
    deletedById: null,
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.payload.mockResolvedValue(null);

  await assert.rejects(
    restoreDatabaseService({
      databaseId: "database-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  assert.equal(updates.length, 2);
});
