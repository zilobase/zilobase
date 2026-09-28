import { recordInteractionStore } from "../interactions/store";
import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import { databaseBootstrapQueryKey, databaseWindowQueryKey } from "../queries/keys";
import { databaseViewQueryHash } from "../views/query-hash";
import type {
  DatabaseBootstrapResponse,
  DatabaseCommandRequest,
  DatabaseRecordEntity,
  DatabaseRecordWindowResponse,
} from "../core/entities";
import { createMutationTestRuntime } from "../../shared/mutation-runtime.test";
import {
  insertOptimisticProperty,
  patchCachedDatabase,
  patchCachedProperty,
  patchCachedView,
  resolveOptimisticScope,
} from "./optimistic";
import { useUpdateDatabasePropertyValue } from "./mutation-hooks";
import { createTestDatabasePayload, setTestDatabaseClientState } from "./test-helpers";

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
      queryHash: databaseViewQueryHash({}),
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

test("database, view, and property patches apply and roll back", () => {
  const queryClient = seededClient();
  try {
    const rollbackDatabase = patchCachedDatabase(queryClient, SESSION, HOST, {
      name: "Renamed",
    });
    assert.equal(readBootstrap(queryClient).database.name, "Renamed");

    const rollbackView = patchCachedView(queryClient, SESSION, HOST, "view-table", {
      name: "Board",
    });
    assert.equal(readBootstrap(queryClient).views[0]!.name, "Board");

    const rollbackProperty = patchCachedProperty(queryClient, SESSION, HOST, "column-status", {
      name: "State",
    });
    assert.equal(
      readBootstrap(queryClient).properties.find((property) => property.id === "column-status")
        ?.property.name,
      "State",
    );

    rollbackProperty();
    assert.equal(
      readBootstrap(queryClient).properties.find((property) => property.id === "column-status")
        ?.property.name,
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
    const { propertyId, rollback } = insertOptimisticProperty(queryClient, SESSION, HOST, {
      dataSourceId: "data-source-1",
      name: "Priority",
      type: "select",
    });
    const after = readBootstrap(queryClient);
    assert.equal(after.properties.length, before + 1);
    assert.equal(
      after.properties.find((property) => property.id === propertyId)?.property.name,
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
    assert.deepEqual(resolveOptimisticScope(queryClient, "data-source-1", "database-9"), {
      hostDatabaseId: "database-9",
    });
    assert.deepEqual(resolveOptimisticScope(queryClient, "data-source-1"), {
      dataSourceId: "data-source-1",
      hostDatabaseId: "database-1",
    });
    assert.deepEqual(resolveOptimisticScope(queryClient, "database-1"), {
      hostDatabaseId: "database-1",
    });
    assert.equal(resolveOptimisticScope(queryClient, "missing"), null);
  } finally {
    queryClient.clear();
  }
});

const hookRecord: DatabaseRecordEntity = {
  createdAt: "2026-09-08T00:00:00.000Z",
  dataSourceId: "data-source-1",
  id: "row-1",
  orderKey: "1024.0000000000",
  page: {
    createdAt: "2026-09-08T00:00:00.000Z",
    deletedAt: null,
    hasContent: false,
    id: "page-1",
    metadata: {},
    name: "Row",
    updatedAt: "2026-09-08T00:00:00.000Z",
  },
  pageId: "page-1",
  parentRowId: null,
  updatedAt: "2026-09-08T00:00:00.000Z",
  valuesByPropertyId: {},
};

function hookAck(commandId: string) {
  return {
    commandId,
    event: {
      actorId: "user-1",
      areas: ["records"],
      changes: { records: [hookRecord] },
      commandId,
      committedAt: "2026-09-08T00:00:00.000Z",
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      eventId: `event-${commandId}`,
      protocolVersion: 2,
      type: "database.mutation",
      version: 1,
    },
    sourceVersions: { "data-source-1": 2 },
    result: hookRecord,
  };
}

function cellValueOf(queryClient: QueryClient): unknown {
  const data = queryClient.getQueryData<{
    pages: DatabaseRecordWindowResponse[];
  }>(
    databaseWindowQueryKey(SESSION, {
      databaseId: HOST,
      dataSourceId: "data-source-1",
      queryHash: databaseViewQueryHash({}),
    }),
  );
  return data?.pages[0]?.records.find((record) => record.id === "row-1")?.valuesByPropertyId[
    "property-status"
  ]?.value;
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test("cell mutations project immediately without modifying server snapshots", async () => {
  let releasePost!: (value: unknown) => void;
  const postGate = new Promise<unknown>((resolve) => {
    releasePost = resolve;
  });
  const { mutation, queryClient } = createMutationTestRuntime(
    useUpdateDatabasePropertyValue,
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      assert.match(path, /commands$/);
      const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
      await postGate;
      return hookAck(request.commandId) as T;
    },
  );
  setTestDatabaseClientState(queryClient, createTestDatabasePayload());
  try {
    assert.equal(cellValueOf(queryClient), "Not started");
    const pending = (
      mutation.mutateAsync as unknown as (input: Record<string, unknown>) => Promise<unknown>
    )({
      databaseId: "data-source-1",
      propertyId: "property-status",
      rowId: "row-1",
      value: "Done",
    });
    await flush();
    const store = recordInteractionStore(queryClient, SESSION, async () => {
      throw new Error("unused");
    });
    assert.equal(cellValueOf(queryClient), "Not started");
    assert.equal(
      store.records("data-source-1").find(({ id }) => id === "row-1")?.valuesByPropertyId[
        "property-status"
      ]?.value,
      "Done",
    );
    releasePost(undefined);
    await pending;
    // Inactive stale windows are evicted, never patched with speculative data.
    assert.equal(cellValueOf(queryClient), undefined);
  } finally {
    queryClient.clear();
  }
});

test("failed cell mutation rolls the cache back", async () => {
  const { mutation, queryClient } = createMutationTestRuntime(
    useUpdateDatabasePropertyValue,
    async <T>(): Promise<T> => {
      throw new Error("network down");
    },
  );
  setTestDatabaseClientState(queryClient, createTestDatabasePayload());
  try {
    await assert.rejects(
      (mutation.mutateAsync as unknown as (input: Record<string, unknown>) => Promise<unknown>)({
        databaseId: "data-source-1",
        propertyId: "property-status",
        rowId: "row-1",
        value: "Done",
      }),
      /network down/,
    );
    assert.equal(cellValueOf(queryClient), "Not started");
  } finally {
    queryClient.clear();
  }
});
