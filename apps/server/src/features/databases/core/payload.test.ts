import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectCalls: 0,
  selectResults: [] as unknown[][],
}));

vi.mock("../../../infrastructure/database", () => ({
  db: {
    select() {
      mocks.selectCalls += 1;
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

import { database } from "../../../infrastructure/database/schema";
import {
  getDatabasePayload,
  getDatabaseSchemaPayload,
} from "./payload";

const existingRecord: typeof database.$inferSelect = {
  config: {},
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  createdById: "user-1",
  deletedAt: null,
  deletedById: null,
  id: "database-1",
  name: "Tasks",
  pageId: "host-page",
  teamspaceId: null,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  version: 3,
  workspaceId: "workspace-1",
};

beforeEach(() => {
  mocks.selectCalls = 0;
  mocks.selectResults.length = 0;
});

test("getDatabasePayload assembles rows, values, schema, and favorite state", async () => {
  mocks.selectResults.push(
    [{
      link: { createdAt: new Date("2026-01-01"), position: 0 },
      source: {
        id: "source-1",
        name: "Tasks",
        parentDatabaseId: "database-1",
      },
    }],
    [{ dataSourceId: "source-1", id: "view-1", name: "Table" }],
    [{ id: "favorite-1" }],
    [{
      column: { dataSourceId: "source-1", id: "column-1", propertyId: "property-1" },
      property: { id: "property-1", name: "Status" },
    }],
    [{
      page: { id: "page-1", name: "Task" },
      row: { dataSourceId: "source-1", id: "row-1", pageId: "page-1", position: 0 },
    }],
    [{ id: "value-1", pageId: "page-1", propertyId: "property-1" }],
  );

  const payload = await getDatabasePayload(
    "database-1",
    "user-1",
    existingRecord,
  );

  assert.equal(payload?.database.isFavorite, true);
  assert.deepEqual(payload?.properties, [{
    dataSourceId: "source-1",
    id: "column-1",
    property: { id: "property-1", name: "Status" },
    propertyId: "property-1",
  }]);
  assert.deepEqual(payload?.rows, [{
    dataSourceId: "source-1",
    id: "row-1",
    page: { id: "page-1", name: "Task" },
    pageId: "page-1",
    position: 0,
  }]);
  assert.equal(payload?.values[0]?.id, "value-1");
  assert.equal(payload?.activeDataSource?.id, "source-1");
  assert.equal(payload?.views[0]?.dataSourceId, "source-1");
  assert.equal(mocks.selectCalls, 6);
});

test("getDatabaseSchemaPayload skips row and value queries", async () => {
  mocks.selectResults.push(
    [{
      link: { createdAt: new Date("2026-01-01"), position: 0 },
      source: { id: "source-1", name: "Tasks", parentDatabaseId: "database-1" },
    }],
    [{ dataSourceId: "source-1", id: "view-1", name: "Table" }],
    [],
    [{
      column: { dataSourceId: "source-1", id: "column-1", propertyId: "property-1" },
      property: { id: "property-1", name: "Status" },
    }],
  );

  const payload = await getDatabaseSchemaPayload(
    "database-1",
    "user-1",
    existingRecord,
  );

  assert.deepEqual(payload?.rows, []);
  assert.deepEqual(payload?.values, []);
  assert.equal(payload?.database.isFavorite, false);
  assert.equal(mocks.selectCalls, 4);
});

test("getDatabasePayload skips favorite and source queries when no sources are linked", async () => {
  mocks.selectResults.push([], []);

  const payload = await getDatabasePayload(
    "database-1",
    undefined,
    existingRecord,
  );

  assert.equal(payload?.database.isFavorite, false);
  assert.deepEqual(payload?.rows, []);
  assert.deepEqual(payload?.values, []);
  assert.equal(mocks.selectCalls, 2);
});

test("getDatabasePayload returns null when the database is missing", async () => {
  mocks.selectResults.push([]);

  assert.equal(await getDatabasePayload("missing"), null);
  assert.equal(mocks.selectCalls, 1);
});
