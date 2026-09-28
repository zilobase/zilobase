import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";

import type { DatabaseRecordEntity } from "../core/entities";
import { parseDatabaseOrderKey } from "../core/order-key";
import { useDatabaseSessionId } from "../queries/session";
import { executeDatabaseCommand } from "./execute";
import { invalidateDatabaseQueries } from "./invalidate";
import {
  cancelHostQueries,
  invalidateOptimisticHost,
  patchCachedCellValue,
  resolveOptimisticScope,
  type OptimisticContext,
} from "./optimistic";
import { findLoadedDataSourceRecords, resolveDataSourceCommandScope } from "./scope";
import {
  dropSerializedQueue,
  orderingSerializationKey,
  runSerialized,
  saveCellValue,
} from "./serialize";

type MoveRowInput = {
  afterRowId: string | null;
  beforeRowId: string | null;
  databaseId: string;
  groupPropertyId?: string;
  groupValue?: unknown;
  hostDatabaseId?: string;
  /** View-local move drafts retire only after a window reaches this version. */
  onCommitted?: (databaseVersion: number) => void;
  /** A view owning a complete move draft does not also patch the group cell. */
  optimistic?: boolean;
  rowId: string;
};

type AddRowInput = {
  afterRowId?: string | null;
  beforeRowId?: string | null;
  databaseId: string;
  hostDatabaseId?: string;
  initialValues?: Array<{ propertyId: string; value: unknown }>;
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

function isRowMoveConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { body?: { code?: unknown }; code?: unknown };
  return candidate.code === "ROW_MOVE_CONFLICT" || candidate.body?.code === "ROW_MOVE_CONFLICT";
}

export function useAddDatabaseRow() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
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
      const sourceScope =
        variables.sourceDataSourceId && variables.sourceRowId
          ? await resolveDataSourceCommandScope(
              queryClient,
              apiFetch,
              variables.sourceDataSourceId,
              variables.sourceHostDatabaseId,
            )
          : undefined;
      const ack = await runSerialized(orderingSerializationKey(scope.dataSourceId), () =>
        executeDatabaseCommand(apiFetch, {
          command: {
            afterRowId: anchors.afterRowId,
            beforeRowId: anchors.beforeRowId,
            pageId: variables.pageId,
            ...(sourceScope && sourceScope.dataSourceId !== scope.dataSourceId
              ? {
                  source: {
                    databaseId: sourceScope.hostDatabaseId,
                    dataSourceId: sourceScope.dataSourceId,
                    rowId: variables.sourceRowId!,
                    propertyMode: variables.sourcePropertyMode ?? "match",
                  },
                }
              : {}),
            parentRowId: variables.parentRowId ?? null,
            title: variables.title ?? "Untitled",
            type: "row.place",
            valuesByPropertyId: variables.initialValues
              ? Object.fromEntries(
                  variables.initialValues.map(({ propertyId, value }) => [propertyId, value]),
                )
              : undefined,
          },
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
        }),
      );

      if (sourceScope)
        invalidateDatabaseQueries(queryClient, sessionId, sourceScope.hostDatabaseId);

      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);

      if (variables.pageId) {
        void queryClient.invalidateQueries({ queryKey: ["pages"] }).catch(() => {
          // Navigation refresh must not delay or reject an already committed row.
        });
      }
      return ack.result as DatabaseRecordEntity;
    },
    onSuccess: async (_data, variables) => {
      try {
        const scope = await resolveDataSourceCommandScope(
          queryClient,
          apiFetch,
          variables.databaseId,
          variables.hostDatabaseId,
        );
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      } catch {
        // Scope resolution failed; cache stays as-is.
      }
    },
  });
}

export function useMoveDatabaseRow() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async (input: MoveRowInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      );
      try {
        const ack = await runSerialized(orderingSerializationKey(scope.dataSourceId), () =>
          executeDatabaseCommand(apiFetch, {
            command: {
              placement: { afterRowId: input.afterRowId, beforeRowId: input.beforeRowId },
              ...(input.groupPropertyId
                ? {
                    valuesByPropertyId: { [input.groupPropertyId]: input.groupValue },
                  }
                : {}),
              rowId: input.rowId,
              type: "row.change",
            },
            databaseId: scope.hostDatabaseId,
            dataSourceId: scope.dataSourceId,
          }),
        );
        input.onCommitted?.(ack.event.version);
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
        return ack.result as DatabaseRecordEntity;
      } catch (error) {
        if (isRowMoveConflict(error)) {
          invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
          dropSerializedQueue(orderingSerializationKey(scope.dataSourceId));
          throw new Error("Order changed — try again.", { cause: error });
        }
        throw error;
      }
    },
    onMutate: async (input): Promise<OptimisticContext | undefined> => {
      // Kanban owns a complete local position + group draft until refetch.
      // Other consumers keep the shared optimistic cell-edit behavior.
      const scope = resolveOptimisticScope(queryClient, input.databaseId, input.hostDatabaseId);
      if (!scope) return undefined;
      if (input.optimistic === false || !input.groupPropertyId) {
        return { rollback: () => undefined, scope };
      }
      await cancelHostQueries(queryClient, sessionId, scope.hostDatabaseId);
      const rollback = patchCachedCellValue(queryClient, sessionId, scope.hostDatabaseId, {
        propertyId: input.groupPropertyId,
        rowId: input.rowId,
        value: input.groupValue,
      });
      return { rollback, scope };
    },
    onError: (_error, _input, context) => {
      context?.rollback();
      invalidateOptimisticHost(queryClient, sessionId, context?.scope);
    },
    onSuccess: async (_data, variables) => {
      try {
        const scope = await resolveDataSourceCommandScope(
          queryClient,
          apiFetch,
          variables.databaseId,
          variables.hostDatabaseId,
        );
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      } catch {
        // Ignore scope failures after a committed move.
      }
    },
  });
}

export function useUpdateDatabasePropertyValue() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  return useMutation({
    mutationFn: async (input: UpdatePropertyValueInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      );
      const ack = await saveCellValue({
        apiFetch,
        dataSourceId: scope.dataSourceId,
        hostDatabaseId: scope.hostDatabaseId,
        propertyId: input.propertyId,
        queryClient,
        rowId: input.rowId,
        sessionId,
        value: input.value,
      });
      return ack.result as DatabaseRecordEntity;
    },
    onMutate: async (input): Promise<OptimisticContext | undefined> => {
      const scope = resolveOptimisticScope(queryClient, input.databaseId, input.hostDatabaseId);
      if (!scope) return undefined;
      await cancelHostQueries(queryClient, sessionId, scope.hostDatabaseId);
      const rollback = patchCachedCellValue(queryClient, sessionId, scope.hostDatabaseId, {
        dataSourceId: scope.dataSourceId,
        propertyId: input.propertyId,
        rowId: input.rowId,
        value: input.value,
      });
      return { rollback, scope };
    },
    onError: (_error, _input, context) => {
      context?.rollback();
      invalidateOptimisticHost(queryClient, sessionId, context?.scope);
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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  return useMutation({
    mutationFn: async (input: { databaseId: string; hostDatabaseId?: string; rowId: string }) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      );
      try {
        const ack = await runSerialized(orderingSerializationKey(scope.dataSourceId), () =>
          executeDatabaseCommand(apiFetch, {
            command: { rowId: input.rowId, type },
            databaseId: scope.hostDatabaseId,
            dataSourceId: scope.dataSourceId,
          }),
        );
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
        return ack.result as DatabaseRecordEntity;
      } catch (error) {
        if (isRowMoveConflict(error)) {
          invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
          dropSerializedQueue(orderingSerializationKey(scope.dataSourceId));
          throw new Error("Order changed — try again.", { cause: error });
        }
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      try {
        const scope = await resolveDataSourceCommandScope(
          queryClient,
          apiFetch,
          variables.databaseId,
          variables.hostDatabaseId,
        );
        invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      } catch {
        // Ignore.
      }
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
  const rowIds =
    findLoadedDataSourceRecords(queryClient, input.databaseId)
      .slice()
      .sort((left, right) =>
        Number(parseDatabaseOrderKey(left.orderKey) - parseDatabaseOrderKey(right.orderKey)),
      )
      .map(({ id }) => id) ?? [];
  const index = Math.max(0, Math.min(input.position ?? rowIds.length, rowIds.length));
  return {
    afterRowId: rowIds[index - 1] ?? null,
    beforeRowId: rowIds[index] ?? null,
  };
}
