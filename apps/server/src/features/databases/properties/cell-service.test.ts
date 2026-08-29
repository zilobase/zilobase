import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  commit: vi.fn(),
  selectResults: [] as unknown[][],
  validate: vi.fn(),
}));

vi.mock("../access/database-access", () => ({
  requireDatabaseEditAccess: mocks.access,
}));
vi.mock("../access/data-source-access", () => ({
  requireDataSourceEditAccess: mocks.access,
}));
vi.mock("../core/commit", () => ({
  commitDatabaseMutation: mocks.commit,
  commitDataSourceMutation: mocks.commit,
}));
vi.mock("./config", () => ({
  validateCellValue: mocks.validate,
}));
vi.mock("../../../infrastructure/database", () => ({
  db: {
    select() {
      const rows = mocks.selectResults.shift() ?? [];
      const builder = {
        from() { return builder; },
        innerJoin() { return builder; },
        where() { return builder; },
        async limit() { return rows; },
      };
      return builder;
    },
  },
}));

import { setDatabaseCellValueService } from "./cell-service";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({
    id: "database-1",
    parentDatabaseId: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.commit.mockReset();
  mocks.selectResults.length = 0;
  mocks.validate.mockReset();
  vi.restoreAllMocks();
});

function transactionRecorder() {
  const inserts: unknown[] = [];
  const conflicts: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    insert() {
      return {
        values(value: unknown) {
          inserts.push(value);
          return {
            async onConflictDoUpdate(options: unknown) {
              conflicts.push(options);
            },
          };
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
  return { conflicts, inserts, updates };
}

test("setDatabaseCellValueService validates and upserts a cell mutation", async () => {
  const { conflicts, inserts, updates } = transactionRecorder();
  mocks.selectResults.push(
    [{ id: "row-1", pageId: "page-1" }],
    [{ config: { options: [] }, id: "property-1", type: "text" }],
  );
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000001",
  );

  const result = await setDatabaseCellValueService({
    databaseId: "database-1",
    env: { ENV: "test" },
    pagePropertyId: "property-1",
    rowId: "row-1",
    userId: "user-1",
    value: "Done",
  });

  assert.deepEqual(result, {
    commit: await mocks.commit.mock.results[0]?.value,
    databaseId: "database-1",
    dataSourceId: "database-1",
    pagePropertyId: "property-1",
    rowId: "row-1",
    rowPageId: "page-1",
  });
  assert.deepEqual(mocks.validate.mock.calls[0], [
    "text",
    { options: [] },
    "Done",
  ]);
  assert.deepEqual(inserts[0], {
    id: "00000000-0000-4000-8000-000000000001",
    pageId: "page-1",
    propertyId: "property-1",
    value: "Done",
  });
  assert.equal(conflicts.length, 1);
  assert.equal(updates.length, 2);
  assert.equal(
    (updates[0] as Record<string, unknown>).updatedAt,
    (updates[1] as Record<string, unknown>).updatedAt,
  );
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["rows", "values"],
    dataSourceId: "database-1",
    env: { ENV: "test" },
  });
  const delta = (await mocks.commit.mock.results[0]?.value)?.delta;
  assert.equal(delta.rows[0].lastEditedById, "user-1");
  assert.equal(delta.values[0].value, "Done");
});

test("setDatabaseCellValueService rejects missing rows or properties", async () => {
  mocks.selectResults.push([], [
    { config: null, id: "property-1", type: "text" },
  ]);
  await assert.rejects(
    setDatabaseCellValueService({
      databaseId: "database-1",
      pagePropertyId: "property-1",
      rowId: "missing",
      userId: "user-1",
      value: "value",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.selectResults.push([{ id: "row-1", pageId: "page-1" }], []);
  await assert.rejects(
    setDatabaseCellValueService({
      databaseId: "database-1",
      pagePropertyId: "missing",
      rowId: "row-1",
      userId: "user-1",
      value: "value",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );
  assert.equal(mocks.commit.mock.calls.length, 0);
});

test("setDatabaseCellValueService stops before committing invalid values", async () => {
  mocks.selectResults.push(
    [{ id: "row-1", pageId: "page-1" }],
    [{ config: null, id: "property-1", type: "text" }],
  );
  mocks.validate.mockImplementation(() => {
    throw new ServiceMutationError("Invalid value", 400);
  });

  await assert.rejects(
    setDatabaseCellValueService({
      databaseId: "database-1",
      pagePropertyId: "property-1",
      rowId: "row-1",
      userId: "user-1",
      value: "invalid",
    }),
    /Invalid value/,
  );
  assert.equal(mocks.commit.mock.calls.length, 0);
});
