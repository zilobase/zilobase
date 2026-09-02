import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  commit: vi.fn(),
  placements: vi.fn(),
  positions: vi.fn(),
}));

vi.mock("../access/database-access", () => ({ requireDatabaseEditAccess: mocks.access }));
vi.mock("../access/data-source-access", () => ({ requireDataSourceEditAccess: mocks.access }));
vi.mock("../core/commit", () => ({
  commitDatabaseMutation: mocks.commit,
  commitDataSourceMutation: mocks.commit,
}));
vi.mock("../core/position-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../core/position-service")>()),
  updateDatabaseRowPlacementPositions: mocks.placements,
  updateDatabaseRowPositions: mocks.positions,
}));

import {
  moveDatabaseRowService,
  reorderDatabaseRowsService,
} from "./position-service";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({ id: "database-1", workspaceId: "workspace-1" });
  mocks.commit.mockReset();
  mocks.placements.mockReset();
  mocks.positions.mockReset();
});

function transactionRecorder(selectResults: unknown[][]) {
  const remaining = [...selectResults];
  const tx = {
    async execute() {},
    insert() {
      return {
        values() {
          return { async onConflictDoUpdate() {} };
        },
      };
    },
    select() {
      const rows = remaining.shift() ?? [];
      const builder = {
        from() { return builder; },
        innerJoin() { return builder; },
        where() { return builder; },
        async limit() { return rows; },
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
    update() {
      return {
        set() { return { async where() {} }; },
      };
    },
  };
  mocks.commit.mockImplementation(async (_options, mutate) => mutate(tx));
  return tx;
}

test("reorderDatabaseRowsService persists row and placement order", async () => {
  const tx = transactionRecorder([[{ id: "row-1" }, { id: "row-2" }]]);

  const result = await reorderDatabaseRowsService({
    databaseId: "database-1",
    rowIds: ["row-2", "row-1"],
    userId: "user-1",
  });

  assert.deepEqual(result.commit.delta.rows, [
    { id: "row-2", position: 0 },
    { id: "row-1", position: 1 },
  ]);
  assert.equal(mocks.positions.mock.calls[0]?.[0], tx);
  assert.equal(mocks.placements.mock.calls[0]?.[0], tx);
});

test("moveDatabaseRowService updates ordering and a group value", async () => {
  transactionRecorder([
    [{ id: "row-1", pageId: "page-1" }, { id: "row-2", pageId: "page-2" }],
    [{ config: null, id: "property-1", type: "text" }],
    [{ value: "Group B" }],
  ]);

  const result = await moveDatabaseRowService({
    databaseId: "database-1",
    groupPropertyId: "property-1",
    groupValue: "Group A",
    rowId: "row-1",
    rowIds: ["row-2", "row-1"],
    userId: "user-1",
  });

  assert.deepEqual(mocks.commit.mock.calls[0]?.[0].changed, ["rows", "values"]);
  assert.deepEqual(result.commit.delta.rows?.map(({ id, position }) => ({ id, position })), [
    { id: "row-2", position: 0 },
    { id: "row-1", position: 1 },
  ]);
  assert.equal(result.commit.delta.values?.[0]?.value, "Group A");
  assert.deepEqual((await mocks.commit.mock.results[0]?.value)?.automationFacts, [
    {
      actorId: "user-1",
      changedValues: [
        { after: "Group A", before: "Group B", propertyId: "property-1" },
      ],
      dataSourceId: "database-1",
      origin: "user",
      pageId: "page-1",
      rowId: "row-1",
    },
  ]);
});

test("row position services reject invalid membership and missing records", async () => {
  await assert.rejects(
    reorderDatabaseRowsService({
      databaseId: "database-1",
      rowIds: ["row-1", "row-1"],
      userId: "user-1",
    }),
    (error: unknown) => error instanceof ServiceMutationError && error.status === 400,
  );

  transactionRecorder([[{ id: "row-1" }]]);
  await assert.rejects(
    moveDatabaseRowService({
      databaseId: "database-1",
      rowId: "missing",
      rowIds: ["row-1"],
      userId: "user-1",
    }),
    (error: unknown) => error instanceof ServiceMutationError && error.status === 404,
  );
});
