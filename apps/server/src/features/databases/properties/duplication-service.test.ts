import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  commit: vi.fn(),
  fetchDelta: vi.fn(),
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
vi.mock("../realtime/delta", () => ({
  fetchDatabasePropertyDelta: mocks.fetchDelta,
}));

import { duplicateDatabasePropertyService } from "./duplication-service";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.commit.mockReset();
  mocks.fetchDelta.mockReset();
  vi.restoreAllMocks();
});

function transactionRecorder(selectResults: unknown[][]) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const remainingResults = [...selectResults];
  const tx = {
    insert() {
      return { async values(value: unknown) { inserts.push(value); } };
    },
    select() {
      const rows = remainingResults.shift() ?? [];
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
        set(value: unknown) {
          updates.push(value);
          return { async where() {} };
        },
      };
    },
  };
  mocks.commit.mockImplementation(async (_options, mutate) => mutate(tx));
  return { inserts, updates };
}

test("duplicateDatabasePropertyService clones metadata and values", async () => {
  const { inserts, updates } = transactionRecorder([
    [{
      column: { id: "column-1", position: 0 },
      property: {
        config: { precision: 2 },
        id: "property-1",
        name: "Cost",
        type: "number",
      },
    }],
    [
      { id: "column-1", name: "Cost", position: 0 },
      { id: "column-2", name: "Cost copy", position: 1 },
    ],
    [{ pageId: "page-1", value: 42 }],
  ]);
  mocks.fetchDelta.mockResolvedValue({
    properties: [{ id: "new-column", position: 1 }],
  });
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000003");

  const result = await duplicateDatabasePropertyService({
    databaseId: "database-1",
    databasePropertyId: "column-1",
    env: { ENV: "test" },
    includeValues: true,
    userId: "user-1",
  });

  assert.equal(result.name, "Cost copy 2");
  assert.equal(result.pagePropertyId, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.databasePropertyId, "00000000-0000-4000-8000-000000000002");
  assert.equal((updates[0] as Record<string, unknown>).position !== undefined, true);
  assert.equal((inserts[0] as Record<string, unknown>).name, "Cost copy 2");
  assert.equal(Array.isArray(inserts[2]), true);
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0].changed, [
    "properties",
    "values",
  ]);
  const delta = (await mocks.commit.mock.results[0]?.value)?.delta;
  assert.deepEqual(delta.properties.map(({ id, position }: any) => ({ id, position })), [
    { id: "column-2", position: 2 },
    { id: "new-column", position: 1 },
  ]);
  assert.deepEqual(delta.values[0], {
    createdAt: delta.values[0].createdAt,
    id: "00000000-0000-4000-8000-000000000003",
    pageId: "page-1",
    propertyId: "00000000-0000-4000-8000-000000000001",
    updatedAt: delta.values[0].updatedAt,
    value: 42,
  });
});

test("duplicateDatabasePropertyService skips values by default", async () => {
  const { inserts } = transactionRecorder([
    [{
      column: { id: "column-1", position: 0 },
      property: { config: null, id: "property-1", name: "Name", type: "text" },
    }],
    [{ id: "column-1", name: "Name", position: 0 }],
  ]);
  mocks.fetchDelta.mockResolvedValue({ properties: [{ id: "new-column" }] });

  const result = await duplicateDatabasePropertyService({
    databaseId: "database-1",
    databasePropertyId: "column-1",
    userId: "user-1",
  });

  assert.equal(inserts.length, 2);
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0].changed, ["properties"]);
  assert.equal("values" in result.commit.delta, false);
});

test("duplicateDatabasePropertyService rejects a missing source", async () => {
  transactionRecorder([[]]);

  await assert.rejects(
    duplicateDatabasePropertyService({
      databaseId: "database-1",
      databasePropertyId: "missing",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );
});
