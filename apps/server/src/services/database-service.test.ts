import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canAccessPage: vi.fn(),
  commit: vi.fn(),
  placement: vi.fn(),
  requireAccess: vi.fn(),
  selectRows: [] as unknown[],
  transaction: vi.fn(),
}));

vi.mock("../access", () => ({ canAccessPage: mocks.canAccessPage }));
vi.mock("./database-access", () => ({
  requireDatabaseEditAccess: mocks.requireAccess,
}));
vi.mock("./database-commit", () => ({
  commitDatabaseMutation: mocks.commit,
}));
vi.mock("../page-item-placements", () => ({
  upsertPageItemPlacement: mocks.placement,
}));
vi.mock("../db", () => ({
  db: {
    select() {
      const builder = {
        from() { return builder; },
        where() { return builder; },
        async limit() { return mocks.selectRows; },
      };
      return builder;
    },
    transaction: mocks.transaction,
  },
}));

import {
  createDatabaseService,
  updateDatabaseService,
} from "./database-service";
import { ServiceMutationError } from "./mutation-error";

beforeEach(() => {
  mocks.canAccessPage.mockReset();
  mocks.canAccessPage.mockResolvedValue(true);
  mocks.commit.mockReset();
  mocks.placement.mockReset();
  mocks.requireAccess.mockReset();
  mocks.requireAccess.mockResolvedValue({ id: "database-1" });
  mocks.selectRows = [];
  mocks.transaction.mockReset();
  vi.restoreAllMocks();
});

function transactionRecorder() {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    insert() {
      return {
        async values(value: unknown) { inserts.push(value); },
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

test("createDatabaseService creates database, default view, and placement atomically", async () => {
  const { inserts, tx } = transactionRecorder();
  mocks.selectRows = [{ id: "page-1" }];
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
  mocks.selectRows = [{ id: "page-1" }];

  const result = await createDatabaseService({
    name: " ",
    pageId: "page-1",
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.equal(result.name, "New database");
});

test("createDatabaseService distinguishes missing and forbidden pages", async () => {
  mocks.selectRows = [];
  await assert.rejects(
    createDatabaseService({
      pageId: "missing",
      userId: "user-1",
      workspaceId: "workspace-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.selectRows = [{ id: "page-1" }];
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

test("updateDatabaseService commits supplied metadata", async () => {
  const { updates } = transactionRecorder();

  const result = await updateDatabaseService({
    config: { icon: "table" },
    databaseId: "database-1",
    env: { ENV: "test" },
    name: "Updated",
    userId: "user-1",
  });

  assert.deepEqual(result, { databaseId: "database-1" });
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
