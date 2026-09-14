import type { QueryClient } from "@tanstack/react-query";
import { type AddRowInput } from "./add-row-transaction";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";

import { type DatabasePayload } from "./queries";
import type { DatabaseRecordEntity } from "./contracts-v2";
import { useDatabaseClient } from "./client/provider";
import {
  findDataSourcePayload,
  resolveDataSourceCommandScope,
} from "./client/command-scope";

type ReorderRowsInput = {
  afterRowId: string | null;
  beforeRowId: string | null;
  databaseId: string;
  hostDatabaseId?: string;
  onOptimisticAccepted?: () => void;
  rowId: string;
};

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

type LegacyMoveRowInput = Omit<MoveRowInput, "afterRowId" | "beforeRowId"> & {
  rowIds: string[];
};

type UpdatePropertyValueInput = {
  databaseId: string;
  hostDatabaseId?: string;
  propertyId: string;
  rowId: string;
  value: unknown;
};

export function reorderDatabaseRows(
  payload: DatabasePayload | null | undefined,
  rowIds: string[],
) {
  if (!payload) {
    return payload;
  }

  const requestedPositions = new Map(
    rowIds.map((rowId, position) => [rowId, position]),
  );
  const rows = payload.rows
    .map((row) => {
      const position = requestedPositions.get(row.id);

      return position === undefined ? row : { ...row, position };
    })
    .sort((left, right) => left.position - right.position);

  return { ...payload, rows };
}

export function updateDatabasePropertyValue(
  payload: DatabasePayload | null | undefined,
  input: UpdatePropertyValueInput,
) {
  if (!payload) {
    return payload;
  }

  const row = payload.rows.find((candidate) => candidate.id === input.rowId);
  const pageId = row?.pageId;

  if (!pageId) {
    return payload;
  }

  const now = new Date().toISOString();
  const existingValue = payload.values.find(
    (value) => value.pageId === pageId && value.propertyId === input.propertyId,
  );
  const nextValue = {
    createdAt: existingValue?.createdAt ?? now,
    id: existingValue?.id ?? `optimistic-property-value-${crypto.randomUUID()}`,
    propertyId: input.propertyId,
    updatedAt: now,
    value: input.value,
    pageId,
  };
  const values = existingValue
    ? payload.values.map((value) =>
        value.id === existingValue.id ? nextValue : value,
      )
    : [...payload.values, nextValue];

  return { ...payload, values };
}

export function moveDatabaseRow(
  payload: DatabasePayload | null | undefined,
  input: LegacyMoveRowInput,
) {
  const reorderedPayload = reorderDatabaseRows(payload, input.rowIds);

  if (!reorderedPayload || !input.groupPropertyId) {
    return reorderedPayload;
  }

  return updateDatabasePropertyValue(reorderedPayload, {
    databaseId: input.databaseId,
    propertyId: input.groupPropertyId,
    rowId: input.rowId,
    value: input.groupValue,
  });
}

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

export function useReorderDatabaseRows() {
  const client = useDatabaseClient();
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (input: ReorderRowsInput) => {
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
  const payload = findDataSourcePayload(queryClient, input.databaseId);
  const rowIds = payload?.rows
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(({ id }) => id) ?? [];
  const index = Math.max(0, Math.min(input.position ?? rowIds.length, rowIds.length));
  return {
    afterRowId: rowIds[index - 1] ?? null,
    beforeRowId: rowIds[index] ?? null,
  };
}
