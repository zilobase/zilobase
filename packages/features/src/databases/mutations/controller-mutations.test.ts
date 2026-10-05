import { sharedClient } from "../../data/client";
import { valueIdentity } from "../schema/cache-entities";
import { resolveRecordWindow, type DatabaseWindowReference } from "../cache-window";
import { databaseController } from "../interactions/store";
import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import { databaseWindowQueryKey } from "../queries/keys";
import { databaseViewQueryHash } from "../views/query-hash";
import type {
  DatabaseCommandRequest,
  DatabaseRecordEntity,
  DatabaseRecordWindowResponse,
} from "../core/entities";
import { createMutationTestRuntime } from "../../shared/mutation-runtime.test";
import { useUpdateDatabasePropertyValue } from "./mutation-hooks";
import { createTestDatabasePayload, setTestDatabaseClientState } from "./test-helpers";

const SESSION = "test-session";
const HOST = "database-1";

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
  valuesByPropertyId: {
    "property-status": {
      id: "value-1",
      pageId: "page-1",
      propertyId: "property-status",
      value: "Done",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.001Z",
    },
  },
};

function hookAck(commandId: string) {
  return {
    commandId,
    event: {
      actorId: "user-1",
      areas: ["records"],
      changes: { records: [hookRecord], sourceVersions: { "data-source-1": 2 } },
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
    pages: DatabaseWindowReference[];
  }>(
    databaseWindowQueryKey(SESSION, {
      databaseId: HOST,
      dataSourceId: "data-source-1",
      queryHash: databaseViewQueryHash({}),
    }),
  );
  return resolveRecordWindow(queryClient, data?.pages[0])?.records.find(
    (record) => record.id === "row-1",
  )?.valuesByPropertyId["property-status"]?.value;
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
    const store = databaseController(queryClient, SESSION, async () => {
      throw new Error("unused");
    });
    assert.equal(
      sharedClient(queryClient)
        .database(HOST)
        ?.databases.values.collection.base.get(valueIdentity("page-1", "property-status"))?.value,
      "Not started",
    );
    assert.equal(cellValueOf(queryClient), "Done");
    assert.equal(
      store.records("data-source-1").find(({ id }) => id === "row-1")?.valuesByPropertyId[
        "property-status"
      ]?.value,
      "Done",
    );
    releasePost(undefined);
    await pending;
    // The ordered reference survives an ordinary edit; all readers resolve confirmation.
    assert.equal(cellValueOf(queryClient), "Done");
  } finally {
    queryClient.clear();
  }
});

test("rejected cell mutation leaves the server snapshot untouched", async () => {
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

test("validated acknowledgement ends saving even when collection publication fails", async () => {
  let writes = 0;
  const { mutation, queryClient } = createMutationTestRuntime(
    useUpdateDatabasePropertyValue,
    async <T>(_path: string, init?: RequestInit): Promise<T> => {
      writes++;
      return hookAck(JSON.parse(String(init?.body)).commandId) as T;
    },
  );
  setTestDatabaseClientState(queryClient, createTestDatabasePayload());
  const owner = sharedClient(queryClient).database(HOST)!;
  owner.databases.ingestEvent = () => {
    throw new Error("Publication failed");
  };
  const store = databaseController(queryClient, SESSION, async () => {
    throw new Error("unused");
  });
  try {
    await (mutation.mutateAsync as unknown as (input: Record<string, unknown>) => Promise<unknown>)(
      { databaseId: "data-source-1", rowId: "row-1", propertyId: "property-status", value: "Done" },
    );
    assert.equal(writes, 1);
    assert.equal(
      store.commandState.get({
        hostDatabaseId: HOST,
        dataSourceId: "data-source-1",
        rowId: "row-1",
        propertyId: "property-status",
      }).isPending,
      false,
    );
    assert.match(store.getSynchronizationError()!.message, /saved/);
    assert.equal(
      owner.databases.values.get(valueIdentity("page-1", "property-status"))?.value,
      "Not started",
    );
  } finally {
    queryClient.clear();
  }
});
