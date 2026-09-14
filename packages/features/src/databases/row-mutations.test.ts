import assert from "node:assert/strict";
import test from "node:test";

import { createMutationTestRuntime } from "../shared/mutation-runtime.test";
import type {
  DatabaseCommandRequest,
  DatabaseRecordEntity,
} from "./contracts-v2";
import { databaseQueryKey } from "./queries";
import {
  getDatabaseRowMoveAnchors,
  useAddDatabaseRow,
  useMoveDatabaseRow,
  useUpdateDatabasePropertyValue,
} from "./mutation-hooks";
import {
  createTestDatabasePayload,
  setTestDatabaseClientState,
} from "./test-helpers";

const record: DatabaseRecordEntity = {
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

function commandApi(
  inspect: (request: DatabaseCommandRequest, path: string) => void,
) {
  return async <T>(path: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
    inspect(request, path);
    return {
      commandId: request.commandId,
      event: {
        actorId: "user-1",
        areas: ["records"],
        changes: { records: [record] },
        commandId: request.commandId,
        committedAt: "2026-09-08T00:00:00.000Z",
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        eventId: `event-${request.commandId}`,
        protocolVersion: 2,
        type: "database.mutation",
        version: 1,
      },
      result: record,
    } as T;
  };
}

for (const operation of ["move", "value"] as const) {
  test(`${operation} sends an optimistic v2 command without payload snapshots`, async () => {
    const original = createTestDatabasePayload();
    const sent: DatabaseCommandRequest[] = [];
    const useHook = operation === "move"
        ? useMoveDatabaseRow
        : useUpdateDatabasePropertyValue;
    const { mutation, queryClient } = createMutationTestRuntime<
      ReturnType<typeof useHook>
    >(useHook, commandApi((request, path) => {
      sent.push(request);
      assert.equal(
        path,
        "/databases/database-1/data-sources/data-source-1/commands",
      );
      assert.equal(queryClient.getQueryData(databaseQueryKey("database-1")), original);
    }));
    queryClient.setQueryData(databaseQueryKey("database-1"), original);
    setTestDatabaseClientState(queryClient, original);
    try {
      const anchors = getDatabaseRowMoveAnchors(["row-2", "row-1"], "row-1");
      const mutateAsync = mutation.mutateAsync as unknown as (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
      if (operation === "value") {
        await mutateAsync({
          databaseId: "data-source-1",
          propertyId: "property-status",
          rowId: "row-1",
          value: "Done",
        });
      } else if (operation === "move") {
        await mutateAsync({
          databaseId: "data-source-1",
          groupPropertyId: "property-status",
          groupValue: "Done",
          ...anchors,
        });
      } else {
        await mutateAsync({ databaseId: "data-source-1", ...anchors });
      }
      assert.equal(sent[0]?.protocolVersion, 2);
      assert.equal(sent[0]?.command.type, operation === "value" ? "cell.set" : "row.move");
      assert.deepEqual(queryClient.getQueryData(databaseQueryKey("database-1")), original);
    } finally {
      queryClient.clear();
    }
  });
}

test("adding a row sends initial values atomically and returns the created record", async () => {
  const original = createTestDatabasePayload();
  const sent: DatabaseCommandRequest[] = [];
  const { mutation, queryClient } = createMutationTestRuntime(
    useAddDatabaseRow,
    commandApi((request) => { sent.push(request); }),
  );
  queryClient.setQueryData(databaseQueryKey("database-1"), original);
  setTestDatabaseClientState(queryClient, original);
  try {
    const result = await mutation.mutateAsync({
      databaseId: "data-source-1",
      optimisticValues: [{ propertyId: "property-status", value: "Done" }],
      title: "Added",
    });
    assert.equal(result.id, "row-1");
    assert.deepEqual(sent[0]?.command, {
      afterRowId: "row-2",
      beforeRowId: null,
      parentRowId: null,
      title: "Added",
      type: "row.create",
      valuesByPropertyId: { "property-status": "Done" },
    });
  } finally {
    queryClient.clear();
  }
});

test("row move anchors contain only immediate neighbors", () => {
  assert.deepEqual(
    getDatabaseRowMoveAnchors(["row-3", "row-1", "row-2"], "row-1"),
    { afterRowId: "row-3", beforeRowId: "row-2", rowId: "row-1" },
  );
  assert.throws(
    () => getDatabaseRowMoveAnchors(["row-1"], "missing"),
    /missing from the requested order/,
  );
});

test("rapid row moves accept optimistic overlays before the ordering lane settles", async () => {
  const original = createTestDatabasePayload();
  const pending: Array<{
    reject: (error: Error) => void;
    request: DatabaseCommandRequest;
  }> = [];
  const apiFetch = <T>(path: string, init?: RequestInit) =>
    new Promise<T>((_resolve, reject) => {
      const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
      assert.equal(
        path,
        "/databases/database-1/data-sources/data-source-1/commands",
      );
      pending.push({ reject, request });
    });
  const { mutation, queryClient } = createMutationTestRuntime(
    useMoveDatabaseRow,
    apiFetch,
  );
  queryClient.setQueryData(databaseQueryKey("database-1"), original);
  setTestDatabaseClientState(queryClient, original);
  const accepted: string[] = [];

  try {
    const first = mutation.mutateAsync({
      afterRowId: "row-2",
      beforeRowId: null,
      databaseId: "data-source-1",
      onOptimisticAccepted: () => accepted.push("first"),
      rowId: "row-1",
    }).catch((error: unknown) => error);
    const second = mutation.mutateAsync({
      afterRowId: null,
      beforeRowId: "row-2",
      databaseId: "data-source-1",
      onOptimisticAccepted: () => accepted.push("second"),
      rowId: "row-1",
    }).catch((error: unknown) => error);

    for (let attempt = 0; accepted.length < 2 && attempt < 20; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    assert.deepEqual(accepted, ["first", "second"]);
    assert.equal(pending.length, 1);
    pending[0]!.reject(new Error("move rejected"));
    const [firstError, secondError] = await Promise.all([first, second]);
    assert.match(String(firstError), /move rejected/);
    assert.equal(
      (secondError as Error).name,
      "DatabaseDependentCommandCancelledError",
    );
    assert.equal(pending.length, 1);
  } finally {
    queryClient.clear();
  }
});
