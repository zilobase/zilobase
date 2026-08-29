import assert from "node:assert/strict";
import { test } from "vitest";

import {
  MAX_DATABASE_REALTIME_DELTA_BYTES,
  fetchDatabasePropertyDelta,
  fetchDatabaseRowDelta,
  fetchDatabaseValuesForPage,
  fetchDatabaseViewDelta,
  prepareDatabaseRealtimeDelta,
  propertyPositionDelta,
  rowPositionDelta,
  toMutationResponse,
} from "./delta";

function selectExecutor(rows: unknown[]) {
  const builder: Record<string, unknown> & PromiseLike<unknown[]> = {
    from() {
      return builder;
    },
    innerJoin() {
      return builder;
    },
    limit: async () => rows,
    then(resolve, reject) {
      return Promise.resolve(rows).then(resolve, reject);
    },
    where() {
      return builder;
    },
  };

  return {
    select() {
      return builder;
    },
  };
}

test("large realtime deltas become invalidate-only events", () => {
  const small = { database: { name: "Small" } };
  const large = {
    database: { value: "x".repeat(MAX_DATABASE_REALTIME_DELTA_BYTES) },
  };

  assert.deepEqual(prepareDatabaseRealtimeDelta(small), {
    requiresRefetch: false,
    value: small,
  });
  assert.deepEqual(prepareDatabaseRealtimeDelta(large), {
    requiresRefetch: true,
    value: {},
  });
});

test("realtime delta sizing accepts the exact byte boundary", () => {
  const prefixBytes = new TextEncoder().encode(
    JSON.stringify({ database: { value: "" } }),
  ).byteLength;
  const boundary = {
    database: {
      value: "x".repeat(MAX_DATABASE_REALTIME_DELTA_BYTES - prefixBytes),
    },
  };

  assert.deepEqual(prepareDatabaseRealtimeDelta(boundary), {
    requiresRefetch: false,
    value: boundary,
  });
});

test("propertyPositionDelta maps ids to zero-based positions", () => {
  assert.deepEqual(propertyPositionDelta(["prop-b", "prop-a", "prop-c"]), {
    properties: [
      { id: "prop-b", position: 0 },
      { id: "prop-a", position: 1 },
      { id: "prop-c", position: 2 },
    ],
  });
});

test("rowPositionDelta maps ids to zero-based positions", () => {
  assert.deepEqual(rowPositionDelta(["row-2", "row-1"]), {
    rows: [
      { id: "row-2", position: 0 },
      { id: "row-1", position: 1 },
    ],
  });
});

test("toMutationResponse combines event metadata with delta", () => {
  const response = toMutationResponse(
    {
      actorId: "user-1",
      changed: ["values"],
      committedAt: "2026-06-24T12:00:00.000Z",
      databaseId: "db-1",
      mutationId: "mutation-1",
      version: 7,
    },
    {
      values: [
        {
          propertyId: "property-1",
          updatedAt: "2026-06-24T12:00:00.000Z",
          value: "Done",
          pageId: "page-1",
        },
      ],
    },
  );

  assert.deepEqual(response, {
    changed: ["values"],
    committedAt: "2026-06-24T12:00:00.000Z",
    databaseId: "db-1",
    delta: {
      values: [
        {
          propertyId: "property-1",
          updatedAt: "2026-06-24T12:00:00.000Z",
          value: "Done",
          pageId: "page-1",
        },
      ],
    },
    mutationId: "mutation-1",
    version: 7,
  });
});

test("toMutationResponse exposes invalidate-only commits", () => {
  assert.deepEqual(
    toMutationResponse(
      {
        actorId: "user-1",
        changed: ["database"],
        committedAt: "2026-08-02T00:00:00.000Z",
        databaseId: "database-1",
        mutationId: "mutation-1",
        requiresRefetch: true,
        version: 2,
      },
      {},
    ),
    {
      changed: ["database"],
      committedAt: "2026-08-02T00:00:00.000Z",
      databaseId: "database-1",
      delta: {},
      mutationId: "mutation-1",
      requiresRefetch: true,
      version: 2,
    },
  );
});

test("database property, view, and row delta readers map query records", async () => {
  const property = { id: "property", name: "Status" };
  const column = { id: "column", propertyId: "property" };
  const view = { id: "view", name: "Table" };
  const page = { id: "page", name: "Row" };
  const row = { id: "row", pageId: "page" };

  assert.deepEqual(
    await fetchDatabasePropertyDelta(
      "database",
      "column",
      selectExecutor([{ column, property }]) as never,
    ),
    { properties: [{ ...column, property }] },
  );
  assert.deepEqual(
    await fetchDatabaseViewDelta("view", selectExecutor([view]) as never),
    { views: [view] },
  );
  assert.deepEqual(
    await fetchDatabaseRowDelta("row", selectExecutor([{ page, row }]) as never),
    { rows: [{ ...row, page }] },
  );
});

test("database delta readers return null for missing records", async () => {
  const executor = selectExecutor([]) as never;

  assert.equal(
    await fetchDatabasePropertyDelta("database", "property", executor),
    null,
  );
  assert.equal(await fetchDatabaseViewDelta("view", executor), null);
  assert.equal(await fetchDatabaseRowDelta("row", executor), null);
});

test("database value delta reads skip empty property queries", async () => {
  const values = [{ pageId: "page", propertyId: "property", value: "Done" }];
  let selects = 0;
  const executor = selectExecutor(values);
  const originalSelect = executor.select;
  executor.select = () => {
    selects += 1;
    return originalSelect();
  };

  assert.deepEqual(
    await fetchDatabaseValuesForPage("page", [], executor as never),
    [],
  );
  assert.equal(selects, 0);
  assert.deepEqual(
    await fetchDatabaseValuesForPage(
      "page",
      ["property"],
      executor as never,
    ),
    values,
  );
  assert.equal(selects, 1);
});
