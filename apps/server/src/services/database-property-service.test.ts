import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  commit: vi.fn(),
  fetchDelta: vi.fn(),
  selectResults: [] as unknown[][],
}));

vi.mock("./database-access", () => ({
  requireDatabaseEditAccess: mocks.access,
}));
vi.mock("./database-commit", () => ({
  commitDatabaseMutation: mocks.commit,
}));
vi.mock("./database-delta", () => ({
  fetchDatabasePropertyDelta: mocks.fetchDelta,
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
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
  },
}));

import {
  createDatabasePropertyService,
  updateDatabasePropertyService,
} from "./database-property-service";
import { ServiceMutationError } from "./mutation-error";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.commit.mockReset();
  mocks.fetchDelta.mockReset();
  mocks.selectResults.length = 0;
  vi.restoreAllMocks();
});

function transactionRecorder(options: {
  selectResults?: unknown[][];
  updateReturningResults?: unknown[][];
} = {}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const selectResults = [...(options.selectResults ?? [])];
  const updateReturningResults = [
    ...(options.updateReturningResults ?? []),
  ];
  const tx = {
    insert() {
      return {
        async values(value: unknown) { inserts.push(value); },
      };
    },
    select() {
      const rows = selectResults.shift() ?? [];
      const builder = {
        from() { return builder; },
        async where() { return rows; },
      };
      return builder;
    },
    update() {
      return {
        set(value: unknown) {
          updates.push(value);
          const result = {
            returning: async () => updateReturningResults.shift() ?? [],
          };
          return {
            where() { return result; },
          };
        },
      };
    },
  };
  mocks.commit.mockImplementation(async (_options, mutate) => mutate(tx));
  return { inserts, updates };
}

test("createDatabasePropertyService inserts and shifts a positioned property", async () => {
  const { inserts, updates } = transactionRecorder();
  mocks.selectResults.push([
    { id: "column-1", position: 0 },
    { id: "column-2", position: 1 },
  ]);
  mocks.fetchDelta.mockResolvedValue({
    properties: [{ id: "new-column", position: 1 }],
  });
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");

  const result = await createDatabasePropertyService({
    config: { precision: 2 },
    databaseId: "database-1",
    env: { ENV: "test" },
    name: " Cost ",
    position: 1,
    type: " NUMBER ",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    databaseId: "database-1",
    databasePropertyId: "00000000-0000-4000-8000-000000000002",
    name: "Cost",
    pagePropertyId: "00000000-0000-4000-8000-000000000001",
    type: "number",
  });
  assert.equal((updates[0] as Record<string, unknown>).position !== undefined, true);
  assert.deepEqual(inserts[0], {
    config: { precision: 2 },
    createdAt: (inserts[0] as Record<string, unknown>).createdAt,
    id: "00000000-0000-4000-8000-000000000001",
    name: "Cost",
    type: "number",
    updatedAt: (inserts[0] as Record<string, unknown>).updatedAt,
    workspaceId: "workspace-1",
  });
  assert.deepEqual(inserts[1], {
    createdAt: (inserts[1] as Record<string, unknown>).createdAt,
    databaseId: "database-1",
    id: "00000000-0000-4000-8000-000000000002",
    position: 1,
    propertyId: "00000000-0000-4000-8000-000000000001",
    updatedAt: (inserts[1] as Record<string, unknown>).updatedAt,
  });
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["properties"],
    databaseId: "database-1",
    env: { ENV: "test" },
  });
  const delta = (await mocks.commit.mock.results[0]?.value)?.delta;
  assert.deepEqual(delta.properties.map(({ id, position }: any) => ({ id, position })), [
    { id: "column-2", position: 2 },
    { id: "new-column", position: 1 },
  ]);
});

test("createDatabasePropertyService applies defaults and rejects invalid types", async () => {
  transactionRecorder();
  mocks.selectResults.push([]);

  const result = await createDatabasePropertyService({
    databaseId: "database-1",
    userId: "user-1",
  });

  assert.equal(result.name, "Property");
  assert.equal(result.type, "text");

  await assert.rejects(
    createDatabasePropertyService({
      databaseId: "database-1",
      type: "unknown",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 400,
  );
});

test("updateDatabasePropertyService updates supplied metadata", async () => {
  const { updates } = transactionRecorder();
  mocks.selectResults.push(
    [{ id: "column-1", propertyId: "property-1" }],
    [{ config: null, type: "text" }],
  );
  mocks.fetchDelta.mockResolvedValue({ properties: [{ id: "column-1" }] });

  const result = await updateDatabasePropertyService({
    config: { options: [] },
    databaseId: "database-1",
    databasePropertyId: "column-1",
    name: "Stage",
    position: 3,
    type: "status",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    databaseId: "database-1",
    databasePropertyId: "column-1",
    pagePropertyId: "property-1",
  });
  assert.equal((updates[0] as Record<string, unknown>).position, 3);
  assert.equal((updates[1] as Record<string, unknown>).name, "Stage");
  assert.equal((updates[1] as Record<string, unknown>).type, "status");
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0].changed, ["properties"]);
});

test("updateDatabasePropertyService normalizes retained status config", async () => {
  const { updates } = transactionRecorder();
  mocks.selectResults.push(
    [{ id: "column-1", propertyId: "property-1" }],
    [{
      config: {
        defaultOptionId: "todo",
        options: [{ id: "todo", name: "Todo" }],
      },
      type: "text",
    }],
  );
  mocks.fetchDelta.mockResolvedValue({ properties: [{ id: "column-1" }] });

  await updateDatabasePropertyService({
    databaseId: "database-1",
    databasePropertyId: "column-1",
    type: "status",
    userId: "user-1",
  });

  assert.equal((updates[1] as Record<string, unknown>).type, "status");
  assert.equal(
    typeof (updates[1] as Record<string, unknown>).config,
    "object",
  );
});

test("updateDatabasePropertyService rejects missing records and invalid types", async () => {
  mocks.selectResults.push([]);
  await assert.rejects(
    updateDatabasePropertyService({
      databaseId: "database-1",
      databasePropertyId: "missing",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.selectResults.push(
    [{ id: "column-1", propertyId: "property-1" }],
    [],
  );
  await assert.rejects(
    updateDatabasePropertyService({
      databaseId: "database-1",
      databasePropertyId: "column-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );

  mocks.selectResults.push(
    [{ id: "column-1", propertyId: "property-1" }],
    [{ config: null, type: "invalid" }],
  );
  await assert.rejects(
    updateDatabasePropertyService({
      databaseId: "database-1",
      databasePropertyId: "column-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 400,
  );
  assert.equal(mocks.commit.mock.calls.length, 0);
});

test("updateDatabasePropertyService clears incompatible values", async () => {
  const changedValue = {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    id: "value-1",
    pageId: "page-1",
    propertyId: "property-1",
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    value: null,
  };
  const { updates } = transactionRecorder({
    updateReturningResults: [[changedValue]],
  });
  mocks.selectResults.push(
    [{ id: "column-1", propertyId: "property-1" }],
    [{ config: null, type: "date" }],
  );
  mocks.fetchDelta.mockResolvedValue(null);

  await updateDatabasePropertyService({
    databaseId: "database-1",
    databasePropertyId: "column-1",
    type: "select",
    userId: "user-1",
  });

  assert.deepEqual(updates[0], {
    updatedAt: (updates[0] as Record<string, unknown>).updatedAt,
    value: null,
  });
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0].changed, [
    "properties",
    "values",
  ]);
  const delta = (await mocks.commit.mock.results[0]?.value)?.delta;
  assert.deepEqual(delta.properties, []);
  assert.deepEqual(delta.values[0], {
    ...changedValue,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });
});

test("updateDatabasePropertyService converts date values to text", async () => {
  const convertedValue = {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    id: "value-1",
    pageId: "page-1",
    propertyId: "property-1",
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    value: "2026-07-10 - 2026-07-12",
  };
  const { updates } = transactionRecorder({
    selectResults: [[{
      id: "value-1",
      value: { end: "2026-07-12", start: "2026-07-10" },
    }]],
    updateReturningResults: [[convertedValue]],
  });
  mocks.selectResults.push(
    [{ id: "column-1", propertyId: "property-1" }],
    [{ config: null, type: "date" }],
  );
  mocks.fetchDelta.mockResolvedValue({ properties: [{ id: "column-1" }] });

  await updateDatabasePropertyService({
    databaseId: "database-1",
    databasePropertyId: "column-1",
    type: "text",
    userId: "user-1",
  });

  assert.equal(
    (updates[0] as Record<string, unknown>).value,
    "2026-07-10 - 2026-07-12",
  );
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0].changed, [
    "properties",
    "values",
  ]);
});
