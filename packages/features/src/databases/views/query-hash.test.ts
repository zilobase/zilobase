import assert from "node:assert/strict";
import test from "node:test";

import {
  databaseViewQueryHash,
  normalizeDatabaseViewQuery,
} from "./query-hash";

test("empty and missing configs share one hash", () => {
  assert.equal(databaseViewQueryHash(undefined), databaseViewQueryHash(null));
  assert.equal(databaseViewQueryHash(null), databaseViewQueryHash({}));
  assert.equal(
    databaseViewQueryHash({}),
    databaseViewQueryHash({ type: "table" }),
  );
});

test("presentation-only differences do not change the hash", () => {
  const base = {
    filters: [{ operator: "is", propertyId: "column-status", values: ["Done"] }],
    sorts: [{ column: "name", direction: "ascending" }],
    type: "table",
  };
  const kanban = {
    ...base,
    groupPropertyId: "column-status",
    hiddenPropertyIds: ["column-status"],
    kanbanGroups: { "column-status": { hidden: [], order: [] } },
    layout: { cardSize: "large" },
    type: "kanban",
  };
  assert.equal(databaseViewQueryHash(base), databaseViewQueryHash(kanban));
});

test("filter changes change the hash", () => {
  const left = { filters: [{ operator: "is", propertyId: "a", values: ["x"] }] };
  const right = { filters: [{ operator: "is", propertyId: "a", values: ["y"] }] };
  const otherColumn = {
    filters: [{ operator: "is", propertyId: "b", values: ["x"] }],
  };
  const otherOperator = {
    filters: [{ operator: "is_not", propertyId: "a", values: ["x"] }],
  };
  assert.notEqual(databaseViewQueryHash(left), databaseViewQueryHash(right));
  assert.notEqual(databaseViewQueryHash(left), databaseViewQueryHash(otherColumn));
  assert.notEqual(
    databaseViewQueryHash(left),
    databaseViewQueryHash(otherOperator),
  );
  assert.notEqual(databaseViewQueryHash(left), databaseViewQueryHash({}));
});

test("sort changes change the hash but order of unrelated keys does not", () => {
  const ascending = { sorts: [{ column: "name", direction: "ascending" }] };
  const descending = { sorts: [{ column: "name", direction: "descending" }] };
  assert.notEqual(
    databaseViewQueryHash(ascending),
    databaseViewQueryHash(descending),
  );
  assert.equal(
    databaseViewQueryHash({ sorts: ascending.sorts, type: "table" }),
    databaseViewQueryHash({ type: "table", sorts: ascending.sorts }),
  );
});

test("filter ids are unstable client state and are excluded", () => {
  const left = {
    filters: [{ id: "filter-0", operator: "is", propertyId: "a", values: ["x"] }],
  };
  const right = {
    filters: [{ id: "saved-id-123", operator: "is", propertyId: "a", values: ["x"] }],
  };
  assert.equal(databaseViewQueryHash(left), databaseViewQueryHash(right));
  assert.deepEqual(normalizeDatabaseViewQuery(left).filters, [{
    id: "",
    operator: "is",
    propertyId: "a",
    values: ["x"],
  }]);
});

test("filter groups hash by structure, not ids", () => {
  const left = {
    filters: [{
      filters: [
        { id: "a", operator: "is", propertyId: "x", values: ["1"] },
        { id: "b", operator: "is", propertyId: "y", values: ["2"] },
      ],
      id: "group-1",
      operator: "or",
      type: "group",
    }],
  };
  const right = {
    filters: [{
      filters: [
        { id: "c", operator: "is", propertyId: "x", values: ["1"] },
        { id: "d", operator: "is", propertyId: "y", values: ["2"] },
      ],
      id: "group-9",
      operator: "or",
      type: "group",
    }],
  };
  const andGroup = {
    filters: [{
      filters: [
        { operator: "is", propertyId: "x", values: ["1"] },
        { operator: "is", propertyId: "y", values: ["2"] },
      ],
      operator: "and",
      type: "group",
    }],
  };
  assert.equal(databaseViewQueryHash(left), databaseViewQueryHash(right));
  assert.notEqual(databaseViewQueryHash(left), databaseViewQueryHash(andGroup));
});

test("includeDeleted participates in the hash", () => {
  assert.notEqual(
    databaseViewQueryHash({}, false),
    databaseViewQueryHash({}, true),
  );
});

test("invalid filters normalize the same way the server evaluates them", () => {
  assert.equal(
    databaseViewQueryHash({ filters: [{ nope: true }] }),
    databaseViewQueryHash({}),
  );
  assert.equal(
    databaseViewQueryHash({ filters: "not-an-array" }),
    databaseViewQueryHash({}),
  );
});
