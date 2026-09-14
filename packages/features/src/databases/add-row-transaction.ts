import type { DatabasePayloadCacheSnapshot } from "./query-cache";
import type { QueryClient } from "@tanstack/react-query";

import {
  applyVersionedDatabaseMutation,
} from "./mutation-cache";
import { cancelDataSourcePayloadQueries, getDataSourcePayloadQueryEntries, restoreDatabasePayloadSnapshots, setDataSourcePayloadQueryData } from "./query-cache";
import {
  type DatabasePayload,
} from "./queries";
import { isDatabaseMutationResponse } from "./mutation-types";
import {
  applyConfirmedAddedDatabaseRow,
  applyOptimisticAddedDatabaseRow,
  applyOptimisticRemovedDatabaseRow,
  isAddRowResponse,
  type AddRowMutationResponse,
} from "./add-row-cache";

export type AddRowInput = {
  afterRowId?: string | null;
  beforeRowId?: string | null;
  databaseId: string;
  hostDatabaseId?: string;
  optimisticValues?: Array<{
    propertyId: string;
    value: unknown;
  }>;
  pageId?: string;
  parentRowId?: string | null;
  position?: number;
  sourceDataSourceId?: string;
  sourceHostDatabaseId?: string;
  sourcePropertyMode?: "duplicate" | "match";
  sourceRowId?: string;
  title?: string;
};

export async function prepareAddedRowMutation(
  queryClient: QueryClient,
  { databaseId, optimisticValues, ...input }: AddRowInput,
) {
  const sourceDataSourceId =
    input.sourceDataSourceId && input.sourceDataSourceId !== databaseId
      ? input.sourceDataSourceId
      : null;

  const [targetSnapshots, sourceSnapshots] = await Promise.all([
    cancelDataSourcePayloadQueries(queryClient, databaseId),
    sourceDataSourceId
      ? cancelDataSourcePayloadQueries(queryClient, sourceDataSourceId)
      : Promise.resolve([]),
  ]);

  const current = findFullPayload(targetSnapshots);
  const sourceCurrent = findFullPayload(sourceSnapshots);
  const optimistic = current
    ? applyOptimisticAddedDatabaseRow(current, {
        ...input,
        values: optimisticValues,
      })
    : null;

  if (optimistic) {
    setDataSourcePayloadQueryData(queryClient, databaseId, optimistic.payload);
  }
  if (sourceDataSourceId && sourceCurrent && input.sourceRowId) {
    setDataSourcePayloadQueryData(
      queryClient,
      sourceDataSourceId,
      applyOptimisticRemovedDatabaseRow(
        sourceCurrent,
        input.sourceRowId,
      ),
    );
  }

  return {
    confirm(response: AddRowMutationResponse) {
      let payload: DatabasePayload;
      if (
        !isAddRowResponse(response) ||
        !isDatabaseMutationResponse(response)
      ) {
        throw new Error("Failed to apply database mutation");
      }

      const latest =
        findFullPayload(getDataSourcePayloadQueryEntries(queryClient, databaseId)) ??
        optimistic?.payload ??
        current;

      if (!latest) {
        throw new Error("Failed to apply database mutation");
      }

      payload = reconcileAddedRow(queryClient, databaseId, latest, optimistic, response, optimisticValues);
      if (response.sourceMutation) {
        applyVersionedDatabaseMutation(queryClient, response.sourceMutation);
        for (const [queryKey] of sourceSnapshots) {
          void queryClient.invalidateQueries({ exact: true, queryKey });
        }
      }

      return payload;
    },
    rollback() {
      restoreDatabasePayloadSnapshots(queryClient, targetSnapshots);
      restoreDatabasePayloadSnapshots(queryClient, sourceSnapshots);
    },
  };
}

function findFullPayload(snapshots: DatabasePayloadCacheSnapshot) {
  return snapshots.find(([queryKey, cached]) => queryKey[2] === "full" && cached)?.[1];
}

function reconcileAddedRow(
  queryClient: QueryClient,
  databaseId: string,
  latest: DatabasePayload,
  optimistic: ReturnType<typeof applyOptimisticAddedDatabaseRow> | null,
  response: AddRowMutationResponse,
  optimisticValues: AddRowInput["optimisticValues"],
) {
  let payload: DatabasePayload;
  payload = applyConfirmedAddedDatabaseRow(
    latest,
    optimistic
      ? { pageId: optimistic.pageId, rowId: optimistic.rowId }
      : null,
    response,
    optimisticValues,
  );
  setDataSourcePayloadQueryData(queryClient, databaseId, payload);
  payload =
    applyVersionedDatabaseMutation(queryClient, response).payload ??
    payload;
  if (optimisticValues?.length) {
    payload = applyConfirmedAddedDatabaseRow(
      payload,
      null,
      response,
      optimisticValues,
    );
    setDataSourcePayloadQueryData(queryClient, databaseId, payload);
  }
  return payload;
}
