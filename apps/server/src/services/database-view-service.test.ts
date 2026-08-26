import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  commit: vi.fn(),
  fetchDelta: vi.fn(),
  fetchPropertyDelta: vi.fn(),
  selectResults: [] as unknown[][],
  upsertValues: vi.fn(),
}));

vi.mock("./database-access", () => ({
  requireDatabaseEditAccess: mocks.access,
}));
vi.mock("./data-source-access", () => ({
  requireDataSourceAccess: mocks.access,
  requireDataSourceEditAccess: mocks.access,
}));
vi.mock("./database-commit", () => ({
  commitDatabaseMutation: mocks.commit,
}));
vi.mock("./database-delta", () => ({
  fetchDatabasePropertyDelta: mocks.fetchPropertyDelta,
  fetchDatabaseViewDelta: mocks.fetchDelta,
}));
vi.mock("./page-property-value-upsert", () => ({
  upsertPagePropertyValues: mocks.upsertValues,
}));
vi.mock("../db", () => ({
  db: {
    select() {
      const rows = mocks.selectResults.shift() ?? [];
      const builder = {
        from() {
          return builder;
        },
        innerJoin() {
          return builder;
        },
        where() {
          return builder;
        },
        orderBy() {
          return builder;
        },
        async limit() {
          return rows;
        },
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
  },
}));

import {
  createDatabaseViewService,
  deleteDatabaseViewService,
  updateDatabaseViewService,
} from "./database-view-service";
import { ServiceMutationError } from "./mutation-error";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({
    id: "database-1",
    name: "Tasks",
    workspaceId: "workspace-1",
  });
  mocks.commit.mockReset();
  mocks.fetchDelta.mockReset();
  mocks.fetchPropertyDelta.mockReset();
  mocks.upsertValues.mockReset();
  mocks.selectResults.length = 0;
  vi.restoreAllMocks();
});

function transactionRecorder() {
  const deletes: unknown[] = [];
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    delete() {
      return {
        async where(value: unknown) {
          deletes.push(value);
        },
      };
    },
    insert() {
      return {
        async values(value: unknown) {
          inserts.push(value);
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
  mocks.commit.mockImplementation(async (_options, mutate) => mutate(tx));
  return { deletes, inserts, updates };
}

test("createDatabaseViewService creates a uniquely named trailing view", async () => {
  const { inserts } = transactionRecorder();
  mocks.selectResults.push([{ dataSourceId: "database-1" }]);
  mocks.selectResults.push([
    { name: "Board", position: 0 },
    { name: "Board 2", position: 1 },
  ]);
  mocks.fetchDelta.mockResolvedValue({ views: [{ id: "view-1" }] });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000001",
  );

  const result = await createDatabaseViewService({
    config: { layout: "compact" },
    databaseId: "database-1",
    dataSourceId: "database-1",
    env: { ENV: "test" },
    name: " Board ",
    type: " board ",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    commit: { delta: { views: [{ id: "view-1" }] } },
    dataSourceId: "database-1",
    databaseId: "database-1",
    name: "Board 3",
    type: "board",
    viewId: "00000000-0000-4000-8000-000000000001",
  });
  assert.deepEqual(inserts[0], {
    config: { layout: "compact" },
    createdAt: (inserts[0] as Record<string, unknown>).createdAt,
    databaseId: "database-1",
    dataSourceId: "database-1",
    id: "00000000-0000-4000-8000-000000000001",
    name: "Board 3",
    position: 2,
    type: "board",
    updatedAt: (inserts[0] as Record<string, unknown>).updatedAt,
  });
  assert.equal(
    (inserts[0] as Record<string, unknown>).createdAt,
    (inserts[0] as Record<string, unknown>).updatedAt,
  );
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["views"],
    databaseId: "database-1",
    env: { ENV: "test" },
  });
});

test("createDatabaseViewService applies table defaults and empty deltas", async () => {
  const { inserts } = transactionRecorder();
  mocks.selectResults.push([{ dataSourceId: "database-1" }]);
  mocks.selectResults.push([]);
  mocks.fetchDelta.mockResolvedValue(null);

  const result = await createDatabaseViewService({
    databaseId: "database-1",
    dataSourceId: "database-1",
    userId: "user-1",
  });

  assert.equal(result.name, "Table");
  assert.equal(result.type, "table");
  assert.equal((inserts[0] as Record<string, unknown>).config, null);
  assert.deepEqual((await mocks.commit.mock.results[0]?.value)?.delta, {
    views: [],
  });
});

test("updateDatabaseViewService updates supplied view fields", async () => {
  const { updates } = transactionRecorder();
  mocks.selectResults.push([{ id: "view-1" }]);
  mocks.fetchDelta.mockResolvedValue({ views: [{ id: "view-1" }] });

  const result = await updateDatabaseViewService({
    config: { filter: true },
    databaseId: "database-1",
    name: "Filtered",
    type: "board",
    userId: "user-1",
    viewId: "view-1",
  });

  assert.deepEqual(result, {
    commit: { delta: { views: [{ id: "view-1" }] } },
    databaseId: "database-1",
    viewId: "view-1",
  });
  assert.deepEqual(updates[0], {
    config: { filter: true },
    name: "Filtered",
    type: "board",
    updatedAt: (updates[0] as Record<string, unknown>).updatedAt,
  });
});

test("updateDatabaseViewService creates single-parent sub-item relation properties", async () => {
  const { inserts, updates } = transactionRecorder();
  mocks.selectResults.push(
    [{ id: "view-1" }],
    [],
    [
      { pageId: "parent-page", parentRowId: null, rowId: "parent-row" },
      {
        pageId: "child-page",
        parentRowId: "parent-row",
        rowId: "child-row",
      },
    ],
    [],
  );
  mocks.fetchDelta.mockResolvedValue({ views: [{ id: "view-1" }] });
  mocks.fetchPropertyDelta
    .mockResolvedValueOnce({ properties: [{ id: "parent-column" }] })
    .mockResolvedValueOnce({ properties: [{ id: "sub-item-column" }] });
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000003")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000004")
    .mockReturnValue("00000000-0000-4000-8000-000000000005");

  await updateDatabaseViewService({
    config: {
      subItems: {
        display: "nested",
        enabled: true,
        filter: "parents-only",
        property: "sub-item",
      },
    },
    databaseId: "database-1",
    userId: "user-1",
    viewId: "view-1",
  });

  assert.equal((inserts[0] as Record<string, unknown>).name, "Parent item");
  assert.equal((inserts[2] as Record<string, unknown>).name, "Sub-item");
  assert.equal(
    (inserts[0] as { config: { relation: { limit: string } } }).config.relation
      .limit,
    "one_page",
  );
  assert.equal(
    (inserts[2] as { config: { relation: { limit: string } } }).config.relation
      .limit,
    "no_limit",
  );
  assert.deepEqual(
    (updates.at(-1) as { config: { subItems: unknown } }).config.subItems,
    {
      display: "nested",
      enabled: true,
      filter: "parents-only",
      parentPropertyId: "00000000-0000-4000-8000-000000000001",
      property: "sub-item",
      subItemPropertyId: "00000000-0000-4000-8000-000000000002",
    },
  );
  assert.equal(mocks.upsertValues.mock.calls.length, 0);
});

test("updateDatabaseViewService rejects missing views", async () => {
  mocks.selectResults.push([]);

  await assert.rejects(
    updateDatabaseViewService({
      databaseId: "database-1",
      userId: "user-1",
      viewId: "missing",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );
  assert.equal(mocks.commit.mock.calls.length, 0);
});

test("deleteDatabaseViewService deletes a view while preserving one remaining view", async () => {
  const { deletes } = transactionRecorder();
  mocks.selectResults.push([{ id: "view-1" }, { id: "view-2" }]);

  const result = await deleteDatabaseViewService({
    databaseId: "database-1",
    env: { ENV: "test" },
    userId: "user-1",
    viewId: "view-1",
  });

  assert.deepEqual(result, {
    commit: { delta: { removedViewIds: ["view-1"] } },
    databaseId: "database-1",
    viewId: "view-1",
  });
  assert.equal(deletes.length, 1);
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["views"],
    databaseId: "database-1",
    env: { ENV: "test" },
  });
});

test("deleteDatabaseViewService rejects missing and last views", async () => {
  mocks.selectResults.push([{ id: "view-2" }]);
  await assert.rejects(
    deleteDatabaseViewService({
      databaseId: "database-1",
      userId: "user-1",
      viewId: "missing",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.selectResults.push([{ id: "view-1" }]);
  await assert.rejects(
    deleteDatabaseViewService({
      databaseId: "database-1",
      userId: "user-1",
      viewId: "view-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 409,
  );
  assert.equal(mocks.commit.mock.calls.length, 0);
});
