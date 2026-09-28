import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";

import type { ChangeRowCommand, DatabaseRecordEntity } from "../core/entities";
import { changeRecordHierarchy } from "../interactions/hierarchy";
import { previewTransferredValues } from "../interactions/transfer";
import type { RecordEffect } from "../interactions/model";
import { useRecordInteractionStore, submitRecordChange } from "../interactions/react";
import { findDataSourceBootstrap, resolveDataSourceCommandScope } from "./scope";

type AddRowInput = {
  afterRowId?: string | null;
  beforeRowId?: string | null;
  databaseId: string;
  hostDatabaseId?: string;
  hierarchy?: ChangeRowCommand["hierarchy"];
  initialValues?: Array<{ propertyId: string; value: unknown }>;
  pageId?: string;
  previewTitle?: string;
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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const store = useRecordInteractionStore();
  return useMutation({
    networkMode: "always",
    mutationFn: async (variables: AddRowInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        variables.databaseId,
        variables.hostDatabaseId,
      );
      const anchors = resolveCreateAnchors(store.records(scope.dataSourceId), {
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
      const sourceRecord = sourceScope
        ? store.records(sourceScope.dataSourceId).find(({ id }) => id === variables.sourceRowId)
        : undefined;
      const targetBootstrap = findDataSourceBootstrap(queryClient, scope.dataSourceId);
      const sourceBootstrap = sourceScope
        ? findDataSourceBootstrap(queryClient, sourceScope.dataSourceId)
        : null;
      const valuesByPropertyId = variables.initialValues
        ? Object.fromEntries(
            variables.initialValues.map(({ propertyId, value }) => [propertyId, value]),
          )
        : undefined;
      const previewValues = {
        ...(sourceRecord
          ? previewTransferredValues({
              record: sourceRecord,
              mode: variables.sourcePropertyMode ?? "match",
              sourceProperties: (sourceBootstrap?.properties ?? []).filter(
                ({ dataSourceId }) => dataSourceId === sourceScope?.dataSourceId,
              ),
              targetProperties: (targetBootstrap?.properties ?? []).filter(
                ({ dataSourceId }) => dataSourceId === scope.dataSourceId,
              ),
            })
          : {}),
        ...valuesByPropertyId,
      };
      const parentRowId = variables.hierarchy?.parentRowId ?? variables.parentRowId ?? null;
      const temporaryId = "pending:" + crypto.randomUUID();
      const pageId = variables.pageId ?? "pending-page:" + crypto.randomUUID();
      const now = new Date().toISOString();
      const record: DatabaseRecordEntity = {
        id: temporaryId,
        pageId,
        dataSourceId: scope.dataSourceId,
        parentRowId,
        orderKey: "0.0000000000",
        createdAt: now,
        updatedAt: now,
        page: sourceRecord
          ? {
              ...sourceRecord.page,
              ...(variables.title !== undefined ? { name: variables.title } : {}),
            }
          : {
              id: pageId,
              name: variables.title ?? variables.previewTitle ?? "Untitled",
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              hasContent: false,
              metadata: null,
            },
        valuesByPropertyId: {},
      };
      const effects: RecordEffect[] = [
        {
          dataSourceId: scope.dataSourceId,
          rowId: temporaryId,
          record,
          placement: anchors,
          values: previewValues,
        },
      ];
      if (variables.hierarchy) {
        const rows = [...store.records(scope.dataSourceId), record];
        for (const change of changeRecordHierarchy({
          ...variables.hierarchy,
          rowId: temporaryId,
          rows,
          values: rows.flatMap(({ valuesByPropertyId }) => Object.values(valuesByPropertyId)),
        }))
          effects.push({
            dataSourceId: scope.dataSourceId,
            rowId: change.rowId,
            values: { [change.propertyId]: change.value },
          });
      }
      const source =
        sourceScope && sourceScope.dataSourceId !== scope.dataSourceId
          ? {
              databaseId: sourceScope.hostDatabaseId,
              dataSourceId: sourceScope.dataSourceId,
              rowId: variables.sourceRowId!,
              propertyMode: variables.sourcePropertyMode ?? ("match" as const),
            }
          : undefined;
      if (source)
        effects.push({
          dataSourceId: source.dataSourceId,
          rowId: source.rowId,
          remove: true,
          record: sourceRecord,
        });
      const ack = await store.submit(
        {
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
          command: {
            type: "row.place",
            ...anchors,
            pageId: variables.pageId,
            parentRowId,
            title: variables.title,
            hierarchy: variables.hierarchy,
            valuesByPropertyId,
            ...(source ? { source } : {}),
          },
        },
        effects,
        temporaryId,
      );

      if (variables.pageId) {
        void queryClient.invalidateQueries({ queryKey: ["pages"] }).catch(() => {
          // Navigation refresh must not delay or reject an already committed row.
        });
      }
      return ack.result as DatabaseRecordEntity;
    },
  });
}

export function useUpdateDatabasePropertyValue() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const store = useRecordInteractionStore();
  return useMutation({
    networkMode: "always",
    mutationFn: async (input: UpdatePropertyValueInput) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      );
      const ack = await submitRecordChange(store, {
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
        rowId: input.rowId,
        valuesByPropertyId: { [input.propertyId]: input.value },
      });
      return ack.result as DatabaseRecordEntity;
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
  const store = useRecordInteractionStore();
  return useMutation({
    networkMode: "always",
    mutationFn: async (input: { databaseId: string; hostDatabaseId?: string; rowId: string }) => {
      const scope = await resolveDataSourceCommandScope(
        queryClient,
        apiFetch,
        input.databaseId,
        input.hostDatabaseId,
      );
      const record = store.records(scope.dataSourceId).find(({ id }) => id === input.rowId);
      const ack = await store.submit(
        {
          databaseId: scope.hostDatabaseId,
          dataSourceId: scope.dataSourceId,
          command: { type, rowId: input.rowId },
        },
        [
          {
            dataSourceId: scope.dataSourceId,
            rowId: input.rowId,
            record,
            remove: type === "row.archive",
          },
        ],
      );
      return ack.result as DatabaseRecordEntity;
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

function resolveCreateAnchors(records: DatabaseRecordEntity[], input: AddRowInput) {
  if (input.beforeRowId !== undefined || input.afterRowId !== undefined)
    return { afterRowId: input.afterRowId ?? null, beforeRowId: input.beforeRowId ?? null };
  const index = Math.max(0, Math.min(input.position ?? records.length, records.length));
  return { afterRowId: records[index - 1]?.id ?? null, beforeRowId: records[index]?.id ?? null };
}
