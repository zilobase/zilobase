import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  canAccessPage: vi.fn(),
  commit: vi.fn(),
  encode: vi.fn(),
  fetchDelta: vi.fn(),
  incrementPlacements: vi.fn(),
  placement: vi.fn(),
  selectResults: [] as unknown[][],
  sourceAccess: vi.fn(),
  inherit: vi.fn(),
}));

vi.mock("../access", () => ({ canAccessPage: mocks.canAccessPage }));
vi.mock("../collaboration/service", () => ({
  encodePageContentAsYjs: mocks.encode,
}));
vi.mock("../page-item-placements", () => ({
  upsertPageItemPlacement: mocks.placement,
}));
vi.mock("./database-access", () => ({
  requireDatabaseAccess: mocks.sourceAccess,
  requireDatabaseEditAccess: mocks.access,
}));
vi.mock("./database-commit", () => ({
  commitDatabaseMutation: mocks.commit,
}));
vi.mock("./database-delta", () => ({
  fetchDatabaseRowDelta: mocks.fetchDelta,
}));
vi.mock("./database-position-service", () => ({
  incrementDatabaseRowPlacementPositions: mocks.incrementPlacements,
}));
vi.mock("./database-row-import-service", () => ({
  inheritDatabaseRowProperties: mocks.inherit,
}));
vi.mock("../db", () => ({
  db: {
    select() {
      const rows = mocks.selectResults.shift() ?? [];
      const builder = {
        from() { return builder; },
        innerJoin() { return builder; },
        where() { return builder; },
        async limit() { return rows; },
        async orderBy() { return rows; },
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
  },
}));

import { createDatabaseRowService } from "./database-row-service";
import { ServiceMutationError } from "./mutation-error";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({
    id: "database-1",
    pageId: "host-page",
    workspaceId: "workspace-1",
  });
  mocks.canAccessPage.mockReset();
  mocks.canAccessPage.mockResolvedValue(true);
  mocks.commit.mockReset();
  mocks.encode.mockReset();
  mocks.encode.mockReturnValue(new Uint8Array([1, 2, 3]));
  mocks.fetchDelta.mockReset();
  mocks.incrementPlacements.mockReset();
  mocks.placement.mockReset();
  mocks.sourceAccess.mockReset();
  mocks.sourceAccess.mockResolvedValue({
    id: "database-source",
    workspaceId: "workspace-1",
  });
  mocks.inherit.mockReset();
  mocks.inherit.mockResolvedValue({ properties: [], values: [] });
  mocks.selectResults.length = 0;
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
  mocks.commit.mockImplementation(async (_options, mutate) => mutate(tx));
  return { inserts, tx, updates };
}

test("createDatabaseRowService creates a page, row, placement, and status value", async () => {
  const { inserts, tx } = transactionRecorder();
  mocks.selectResults.push(
    [
      { id: "row-1", pageId: "page-1", position: 0 },
      { id: "row-2", pageId: "page-2", position: 1 },
    ],
    [{
      config: {
        defaultOptionId: "todo",
        options: [{ id: "todo", name: "Todo" }],
      },
      id: "status-property",
    }],
    [],
  );
  mocks.fetchDelta.mockResolvedValue({
    rows: [{ id: "new-row", position: 1 }],
  });
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000003");

  const result = await createDatabaseRowService({
    databaseId: "database-1",
    env: { ENV: "test" },
    parentRowId: "parent-row",
    position: 1,
    title: "New task",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    commit: await mocks.commit.mock.results[0]?.value,
    createdAt: result.createdAt,
    databaseId: "database-1",
    isFavorite: false,
    parentRowId: "parent-row",
    position: 1,
    rowId: "00000000-0000-4000-8000-000000000002",
    rowPageId: "00000000-0000-4000-8000-000000000001",
    title: "New task",
    updatedAt: result.createdAt,
  });
  assert.deepEqual(inserts[0], {
    content: null,
    createdAt: (inserts[0] as Record<string, unknown>).createdAt,
    createdById: "user-1",
    id: "00000000-0000-4000-8000-000000000001",
    metadata: null,
    name: "New task",
    type: "pageblock",
    updatedAt: (inserts[0] as Record<string, unknown>).updatedAt,
    url: "#",
    workspaceId: "workspace-1",
  });
  assert.equal(Buffer.isBuffer((inserts[1] as Record<string, unknown>).state), true);
  assert.equal((inserts[2] as Record<string, unknown>).position, 1);
  assert.equal((inserts[2] as Record<string, unknown>).parentRowId, "parent-row");
  assert.equal(Array.isArray(inserts[3]), true);
  assert.deepEqual((inserts[3] as Array<Record<string, unknown>>)[0]?.value, "Todo");
  assert.deepEqual(mocks.placement.mock.calls[0], [
    tx,
    {
      itemId: "00000000-0000-4000-8000-000000000001",
      itemKind: "page",
      parentId: "database-1",
      parentKind: "database",
      placementKind: "database_row",
      position: 1,
      sourceRowId: "00000000-0000-4000-8000-000000000002",
      workspaceId: "workspace-1",
    },
  ]);
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["rows", "values"],
    databaseId: "database-1",
    env: { ENV: "test" },
  });
  const delta = (await mocks.commit.mock.results[0]?.value)?.delta;
  assert.deepEqual(delta.rows.map(({ id, position }: any) => ({ id, position })), [
    { id: "row-2", position: 2 },
    { id: "new-row", position: 1 },
  ]);
  assert.equal(delta.values[0].value, "Todo");
});

test("createDatabaseRowService attaches an editable existing page", async () => {
  const { inserts, updates } = transactionRecorder();
  mocks.selectResults.push(
    [],
    [{
      id: "existing-page",
      metadata: { icon: "check" },
      name: " Existing task ",
      workspaceId: "workspace-1",
    }],
    [],
    [],
  );
  mocks.fetchDelta.mockResolvedValue(null);
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000001",
  );

  const result = await createDatabaseRowService({
    databaseId: "database-1",
    pageId: "existing-page",
    userId: "user-1",
  });

  assert.equal(result.rowPageId, "existing-page");
  assert.equal(result.title, "Existing task");
  assert.deepEqual(mocks.canAccessPage.mock.calls[0], [
    "existing-page",
    "user-1",
    "edit",
  ]);
  assert.deepEqual(updates[0], {
    metadata: { icon: "check" },
    updatedAt: (updates[0] as Record<string, unknown>).updatedAt,
  });
  assert.equal(inserts.length, 1);
  assert.equal((inserts[0] as Record<string, unknown>).pageId, "existing-page");
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0].changed, ["rows"]);
  assert.deepEqual((await mocks.commit.mock.results[0]?.value)?.delta, {
    rows: [],
  });
});

test("createDatabaseRowService defaults new and blank existing page titles", async () => {
  transactionRecorder();
  mocks.selectResults.push([], [], []);
  const created = await createDatabaseRowService({
    databaseId: "database-1",
    userId: "user-1",
  });
  assert.equal(created.title, "Untitled");

  transactionRecorder();
  mocks.selectResults.push(
    [],
    [{ id: "page-1", metadata: [], name: " ", workspaceId: "workspace-1" }],
    [],
    [],
  );
  const attached = await createDatabaseRowService({
    databaseId: "database-1",
    pageId: "page-1",
    userId: "user-1",
  });
  assert.equal(attached.title, "Untitled");
});

test("createDatabaseRowService rejects host, missing, and forbidden pages", async () => {
  await assert.rejects(
    createDatabaseRowService({
      databaseId: "database-1",
      pageId: "host-page",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 400,
  );

  mocks.selectResults.push([], []);
  await assert.rejects(
    createDatabaseRowService({
      databaseId: "database-1",
      pageId: "missing-page",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.canAccessPage.mockResolvedValue(false);
  mocks.selectResults.push(
    [],
    [{ id: "page-1", metadata: null, name: "Page", workspaceId: "workspace-1" }],
  );
  await assert.rejects(
    createDatabaseRowService({
      databaseId: "database-1",
      pageId: "page-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 403,
  );
  assert.equal(mocks.commit.mock.calls.length, 0);
});

test("createDatabaseRowService rejects duplicate pages", async () => {
  mocks.selectResults.push(
    [{ id: "row-1", pageId: "page-1", position: 0 }],
    [{ id: "page-1", metadata: null, name: "Page", workspaceId: "workspace-1" }],
  );

  await assert.rejects(
    createDatabaseRowService({
      databaseId: "database-1",
      pageId: "page-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 409,
  );
  assert.equal(mocks.commit.mock.calls.length, 0);
});

test("createDatabaseRowService imports source properties and values", async () => {
  transactionRecorder();
  mocks.selectResults.push(
    [],
    [{ id: "page-1", metadata: null, name: "Page", workspaceId: "workspace-1" }],
    [],
    [],
  );
  mocks.inherit.mockResolvedValue({
    properties: [{ id: "column-imported" }],
    values: [{ pageId: "page-1", propertyId: "property-imported", value: 7 }],
  });

  const result = await createDatabaseRowService({
    databaseId: "database-1",
    pageId: "page-1",
    sourceDatabaseId: "database-source",
    sourcePropertyMode: "match",
    userId: "user-1",
  });

  assert.deepEqual(mocks.sourceAccess.mock.calls[0], [
    "database-source",
    "user-1",
    "view",
  ]);
  assert.equal(mocks.inherit.mock.calls[0]?.[0].sourcePropertyMode, "match");
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0].changed, [
    "rows",
    "properties",
    "values",
  ]);
  assert.deepEqual(result.commit.delta.properties, [{ id: "column-imported" }]);
  assert.equal(result.commit.delta.values?.[0]?.value, 7);
});
