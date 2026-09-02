import assert from "node:assert/strict";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateAutomationDependencies: vi.fn(),
  access: vi.fn(),
  commit: vi.fn(),
  updatePositions: vi.fn(),
}));

vi.mock("../automations/service", () => ({
  invalidateDatabaseAutomationDependencies: mocks.invalidateAutomationDependencies,
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
vi.mock("../core/position-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../core/position-service")>()),
  updateDatabasePropertyPositions: mocks.updatePositions,
}));

import {
  deleteDatabasePropertyService,
  reorderDatabasePropertiesService,
} from "./structure-service";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.commit.mockReset();
  mocks.updatePositions.mockReset();
});

function transactionRecorder(selectResults: unknown[][]) {
  const updates: unknown[] = [];
  const remainingResults = [...selectResults];
  const tx = {
    select() {
      const rows = remainingResults.shift() ?? [];
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
  return { tx, updates };
}

test("reorderDatabasePropertiesService validates and persists the full order", async () => {
  const { tx } = transactionRecorder([
    [{ id: "column-1" }, { id: "column-2" }],
  ]);

  const result = await reorderDatabasePropertiesService({
    databaseId: "database-1",
    env: { ENV: "test" },
    propertyIds: ["column-2", "column-1"],
    userId: "user-1",
  });

  assert.deepEqual(result, {
    commit: {
      delta: {
        properties: [
          { id: "column-2", position: 0 },
          { id: "column-1", position: 1 },
        ],
      },
    },
    dataSourceId: "database-1",
  });
  assert.equal(mocks.updatePositions.mock.calls[0]?.[0], tx);
  assert.deepEqual(mocks.updatePositions.mock.calls[0]?.slice(1, 3), [
    "database-1",
    ["column-2", "column-1"],
  ]);
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["properties"],
    dataSourceId: "database-1",
    env: { ENV: "test" },
  });
});

test("reorderDatabasePropertiesService rejects duplicate or incomplete orders", async () => {
  await assert.rejects(
    reorderDatabasePropertiesService({
      databaseId: "database-1",
      propertyIds: ["column-1", "column-1"],
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 400,
  );

  transactionRecorder([[{ id: "column-1" }, { id: "column-2" }]]);
  await assert.rejects(
    reorderDatabasePropertiesService({
      databaseId: "database-1",
      propertyIds: ["column-1"],
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError &&
      error.message ===
        "propertyIds must include every active database property",
  );
});

test("deleteDatabasePropertyService soft deletes and compacts positions", async () => {
  const { tx, updates } = transactionRecorder([
    [{ columnId: "column-2", pagePropertyId: "property-2" }],
    [{ id: "column-1" }, { id: "column-2" }, { id: "column-3" }],
  ]);

  const result = await deleteDatabasePropertyService({
    databaseId: "database-1",
    databasePropertyId: "column-2",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    commit: {
      delta: {
        properties: [
          { id: "column-1", position: 0 },
          { id: "column-3", position: 1 },
        ],
        removedPagePropertyIds: ["property-2"],
        removedPropertyIds: ["column-2"],
      },
    },
    dataSourceId: "database-1",
  });
  assert.equal((updates[0] as Record<string, unknown>).deletedById, "user-1");
  assert.equal(mocks.updatePositions.mock.calls[0]?.[0], tx);
  assert.deepEqual(mocks.updatePositions.mock.calls[0]?.slice(1, 3), [
    "database-1",
    ["column-1", "column-3"],
  ]);
  expect(mocks.invalidateAutomationDependencies).toHaveBeenCalledWith(
    expect.objectContaining({
      dependencyId: "column-2",
      dependencyType: "property",
    }),
  );
});

test("deleteDatabasePropertyService rejects a missing active property", async () => {
  transactionRecorder([[]]);

  await assert.rejects(
    deleteDatabasePropertyService({
      databaseId: "database-1",
      databasePropertyId: "missing",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );
  assert.equal(mocks.updatePositions.mock.calls.length, 0);
});
