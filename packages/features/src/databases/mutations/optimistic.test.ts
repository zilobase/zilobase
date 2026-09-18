import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import {
  databaseBootstrapQueryKey,
  databaseWindowQueryKey,
} from "../queries/keys";
import type {
  DatabaseBootstrapResponse,
  DatabaseRecordWindowResponse,
} from "../core/entities";
import {
  insertOptimisticProperty,
  patchCachedCellValue,
  patchCachedDatabase,
  patchCachedProperty,
  patchCachedView,
  resolveOptimisticScope,
} from "./optimistic";
import {
  createTestDatabasePayload,
  setTestDatabaseClientState,
} from "./test-helpers";

const SESSION = "test-session";
const HOST = "database-1";

function seededClient(): QueryClient {
  const queryClient = new QueryClient();
  setTestDatabaseClientState(queryClient, createTestDatabasePayload());
  return queryClient;
}

function readWindow(queryClient: QueryClient): DatabaseRecordWindowResponse {
  const data = queryClient.getQueryData<{
    pages: DatabaseRecordWindowResponse[];
  }>(
    databaseWindowQueryKey(SESSION, {
      databaseId: HOST,
      dataSourceId: "data-source-1",
      viewId: "view-table",
    }),
  );
  assert.ok(data);
  return data.pages[0]!;
}

function readBootstrap(queryClient: QueryClient): DatabaseBootstrapResponse {
  const data = queryClient.getQueryData<DatabaseBootstrapResponse>(
    databaseBootstrapQueryKey(SESSION, { databaseId: HOST }),
  );
  assert.ok(data);
  return data;
}

test("cell patch updates the cached record and rolls back", () => {
  const queryClient = seededClient();
  try {
    const before = readWindow(queryClient).records.find(
      (record) => record.id === "row-1",
    )?.valuesByPropertyId["property-status"]?.value;
    assert.equal(before, "Not started");

    const rollback = patchCachedCellValue(queryClient, SESSION, HOST, {
      dataSourceId: "data-source-1",
      propertyId: "property-status",
      rowId: "row-1",
      value: "Done",
    });
    assert.equal(
      readWindow(queryClient).records.find((record) => record.id === "row-1")
        ?.valuesByPropertyId["property-status"]?.value,
      "Done",
    );
    // Untouched row keeps its values.
    assert.equal(
      readWindow(queryClient).records.find((record) => record.id === "row-2")
        ?.valuesByPropertyId["property-status"],
      undefined,
    );

    rollback();
    assert.equal(
      readWindow(queryClient).records.find((record) => record.id === "row-1")
        ?.valuesByPropertyId["property-status"]?.value,
      "Not started",
    );
  } finally {
    queryClient.clear();
  }
});

test("cell patch ignores unknown rows and other hosts", () => {
  const queryClient = seededClient();
  try {
    const rollback = patchCachedCellValue(queryClient, SESSION, HOST, {
      propertyId: "property-status",
      rowId: "row-missing",
      value: "Done",
    });
    assert.equal(
      readWindow(queryClient).records.find((record) => record.id === "row-1")
        ?.valuesByPropertyId["property-status"]?.value,
      "Not started",
    );
    const other = patchCachedCellValue(queryClient, SESSION, "database-2", {
      propertyId: "property-status",
      rowId: "row-1",
      value: "Done",
    });
    assert.equal(
      readWindow(queryClient).records.find((record) => record.id === "row-1")
        ?.valuesByPropertyId["property-status"]?.value,
      "Not started",
    );
    rollback();
    other();
  } finally {
    queryClient.clear();
  }
});

test("database, view, and property patches apply and roll back", () => {
  const queryClient = seededClient();
  try {
    const rollbackDatabase = patchCachedDatabase(queryClient, SESSION, HOST, {
      name: "Renamed",
    });
    assert.equal(readBootstrap(queryClient).database.name, "Renamed");

    const rollbackView = patchCachedView(
      queryClient,
      SESSION,
      HOST,
      "view-table",
      { name: "Board" },
    );
    assert.equal(readBootstrap(queryClient).views[0]!.name, "Board");

    const rollbackProperty = patchCachedProperty(
      queryClient,
      SESSION,
      HOST,
      "column-status",
      { name: "State" },
    );
    assert.equal(
      readBootstrap(queryClient).properties.find(
        (property) => property.id === "column-status",
      )?.property.name,
      "State",
    );

    rollbackProperty();
    assert.equal(
      readBootstrap(queryClient).properties.find(
        (property) => property.id === "column-status",
      )?.property.name,
      "Status",
    );
    rollbackView();
    assert.equal(readBootstrap(queryClient).views[0]!.name, "Table");
    rollbackDatabase();
    assert.equal(readBootstrap(queryClient).database.name, "Projects");
  } finally {
    queryClient.clear();
  }
});

test("inserted optimistic property is removed on rollback", () => {
  const queryClient = seededClient();
  try {
    const before = readBootstrap(queryClient).properties.length;
    const { propertyId, rollback } = insertOptimisticProperty(
      queryClient,
      SESSION,
      HOST,
      { dataSourceId: "data-source-1", name: "Priority", type: "select" },
    );
    const after = readBootstrap(queryClient);
    assert.equal(after.properties.length, before + 1);
    assert.equal(
      after.properties.find((property) => property.id === propertyId)
        ?.property.name,
      "Priority",
    );
    rollback();
    assert.equal(readBootstrap(queryClient).properties.length, before);
  } finally {
    queryClient.clear();
  }
});

test("scope resolution stays cache-only", () => {
  const queryClient = seededClient();
  try {
    assert.deepEqual(
      resolveOptimisticScope(queryClient, "data-source-1", "database-9"),
      { hostDatabaseId: "database-9" },
    );
    assert.deepEqual(
      resolveOptimisticScope(queryClient, "data-source-1"),
      { dataSourceId: "data-source-1", hostDatabaseId: "database-1" },
    );
    assert.deepEqual(resolveOptimisticScope(queryClient, "database-1"), {
      hostDatabaseId: "database-1",
    });
    assert.equal(resolveOptimisticScope(queryClient, "missing"), null);
  } finally {
    queryClient.clear();
  }
});
