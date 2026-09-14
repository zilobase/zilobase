import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";

import type { DatabaseRecordEntity } from "./contracts-v2";
import { parseDatabaseOrderKey } from "./order-key";
import { useDatabaseClient } from "./client/provider";
import {
  findLoadedDataSourceRecords,
  resolveDataSourceCommandScope,
} from "./client/command-scope";

type MoveRowInput = {
  afterRowId: string | null;
  beforeRowId: string | null;
  databaseId: string;
  groupPropertyId?: string;
  groupValue?: unknown;
  hostDatabaseId?: string;
  onOptimisticAccepted?: () => void;
  rowId: string;
};

type AddRowInput = {
  afterRowId?: string | null;
  beforeRowId?: string | null;
  databaseId: string;
  hostDatabaseId?: string;
  optimisticValues?: Array<{ propertyId: string; value: unknown }>;
  pageId?: string;
  parentRowId?: string | null;
  position?: number;
  sourceDataSourceId?: string;
  sourceHostDatabaseId?: string;
  sourcePropertyMode?: "duplicate" | "match";
  sourceRowId?: string;
  title?: string;
};

type UpdatePropertyValueInput = {
  databaseId: string;
  hostDatabaseId?: string;
  propertyId: string;
  rowId: string;
  value: unknown;
};

export function useAddDatabaseRow() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async (variables: AddRowInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        variables.databaseId,
        variables.hostDatabaseId,
      );
      const anchors = resolveCreateAnchors(queryClient, {
        ...variables,
        databaseId: scope.dataSourceId,
      });
      const record = await client.execute<DatabaseRecordEntity>({
        command: {
          afterRowId: anchors.afterRowId,
          beforeRowId: anchors.beforeRowId,
          pageId: variables.pageId,
          parentRowId: variables.parentRowId ?? null,
          title: variables.title ?? "Untitled",
          type: "row.create",
          valuesByPropertyId: variables.optimisticValues
            ? Object.fromEntries(
                variables.optimisticValues.map(({ propertyId, value }) => [
                  propertyId,
                  value,
                ]),
              )
            : undefined,
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;

      if (
        variables.sourceDataSourceId &&
        variables.sourceDataSourceId !== variables.databaseId &&
        variables.sourceRowId
      ) {
        const sourceScope = await resolveDataSourceCommandScope(
          queryClient,
          apiFetch,
          variables.sourceDataSourceId,
          variables.sourceHostDatabaseId,
        );
        await client.execute({
          command: { rowId: variables.sourceRowId, type: "row.archive" },
          databaseId: sourceScope.hostDatabaseId,
          dataSourceId: sourceScope.dataSourceId,
        }).promise;
      }

      if (variables.pageId) {
        void queryClient.invalidateQueries({ queryKey: ["pages"] }).catch(() => {
          // Navigation refresh must not delay or reject an already committed row.
        });
      }
      return record;
    },
  });
}

export function useMoveDatabaseRow() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (input: MoveRowInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      );
      const transaction = client.execute<DatabaseRecordEntity>({
        command: {
          afterRowId: input.afterRowId,
          beforeRowId: input.beforeRowId,
          ...(input.groupPropertyId
            ? {
                group: {
                  propertyId: input.groupPropertyId,
                  value: input.groupValue,
                },
              }
            : {}),
          rowId: input.rowId,
          type: "row.move",
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      input.onOptimisticAccepted?.();
      return transaction.promise;
    },
  });
}

export function useUpdateDatabasePropertyValue() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (input: UpdatePropertyValueInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      );
      return client.execute<DatabaseRecordEntity>({
        command: {
          propertyId: input.propertyId,
          rowId: input.rowId,
          type: "cell.set",
          value: input.value,
        },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;
    },
  });
}

export function useArchiveDatabaseRow() {
  return useDatabaseRowStateMutation("row.archive");
}

export function useRestoreDatabaseRow() {
  return useDatabaseRowStateMutation("row.restore");
}

function useDatabaseRowStateMutation(type: "row.archive" | "row.restore") {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async (input: {
      databaseId: string;
      hostDatabaseId?: string;
      rowId: string;
    }) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      );
      return client.execute<DatabaseRecordEntity>({
        command: { rowId: input.rowId, type },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      }).promise;
    },
  });
}

export function getDatabaseRowMoveAnchors(rowIds: string[], rowId: string) {
  const index = rowIds.indexOf(rowId);
  if (index < 0) {
    throw new Error("Moved row is missing from the requested order");
  }
  return {
    afterRowId: rowIds[index - 1] ?? null,
    beforeRowId: rowIds[index + 1] ?? null,
    rowId,
  };
}

function resolveCreateAnchors(queryClient: QueryClient, input: AddRowInput) {
  if (input.beforeRowId !== undefined || input.afterRowId !== undefined) {
    return {
      afterRowId: input.afterRowId ?? null,
      beforeRowId: input.beforeRowId ?? null,
    };
  }
  const rowIds = findLoadedDataSourceRecords(queryClient, input.databaseId)
    .slice()
    .sort((left, right) => Number(
      parseDatabaseOrderKey(left.orderKey) - parseDatabaseOrderKey(right.orderKey),
    ))
    .map(({ id }) => id) ?? [];
  const index = Math.max(0, Math.min(input.position ?? rowIds.length, rowIds.length));
  return {
    afterRowId: rowIds[index - 1] ?? null,
    beforeRowId: rowIds[index] ?? null,
  };
}
