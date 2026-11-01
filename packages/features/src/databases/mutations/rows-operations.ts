import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";

import type { ChangeRowCommand, DatabaseRecordEntity } from "../core/entities";
import { changeRecordHierarchy } from "../interactions/hierarchy";
import type { RecordEffect } from "../interactions/model";
import { submitRecordChange } from "../interactions/record-change";
import { previewTransferredValues } from "../interactions/transfer";
import { buildRowPlace, buildRowState } from "./command-builders";
import { findDataSourceBootstrap, resolveDataSourceCommandScope } from "./scope";

export type AddRowInput = {
  clearSortViewId?: string;
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

export type UpdatePropertyValueInput = {
  databaseId: string;
  hostDatabaseId?: string;
  propertyId: string;
  rowId: string;
  value: unknown;
};

export type AddDatabaseRowInput = AddRowInput;
export type AddDatabaseRowResult = DatabaseRecordEntity;
export function addDatabaseRow(
  context: ClientOperationContext,
  input: AddDatabaseRowInput,
): Promise<AddDatabaseRowResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const { queryClient } = context;
    const store = clientDatabaseController(context);
    return clientMutation({
      networkMode: "always",
      mutationFn: async (variables: AddDatabaseRowInput) => {
        const scope = resolveDataSourceCommandScope(
          queryClient,
          store.sessionId,
          variables.databaseId,
          variables.hostDatabaseId,
        );
        const sourceScope =
          variables.sourceDataSourceId && variables.sourceRowId
            ? resolveDataSourceCommandScope(
                queryClient,
                store.sessionId,
                variables.sourceDataSourceId,
                variables.sourceHostDatabaseId,
              )
            : undefined;
        const sourceRecord = sourceScope
          ? store.records(sourceScope.dataSourceId).find(({ id }) => id === variables.sourceRowId)
          : undefined;
        const targetBootstrap = findDataSourceBootstrap(
          queryClient,
          store.sessionId,
          scope.dataSourceId,
        );
        const sourceBootstrap = sourceScope
          ? findDataSourceBootstrap(queryClient, store.sessionId, sourceScope.dataSourceId)
          : null;
        const source =
          sourceScope && sourceScope.dataSourceId !== scope.dataSourceId
            ? {
                databaseId: sourceScope.hostDatabaseId,
                dataSourceId: sourceScope.dataSourceId,
                rowId: variables.sourceRowId!,
                propertyMode: variables.sourcePropertyMode ?? ("match" as const),
              }
            : undefined;
        const {
          anchors,
          input: command,
          parentRowId,
          valuesByPropertyId,
        } = buildRowPlace(scope, store.records(scope.dataSourceId), { ...variables, source });
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
        if (source)
          effects.push({
            dataSourceId: source.dataSourceId,
            rowId: source.rowId,
            remove: true,
            record: sourceRecord,
          });
        const ack = await store.submit(command, effects, temporaryId);

        return ack.result as DatabaseRecordEntity;
      },
    });
  });
}

export type UpdateDatabasePropertyValueInput = UpdatePropertyValueInput;
export type UpdateDatabasePropertyValueResult = DatabaseRecordEntity;
export function updateDatabasePropertyValue(
  context: ClientOperationContext,
  input: UpdateDatabasePropertyValueInput,
): Promise<UpdateDatabasePropertyValueResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const { queryClient } = context;
    const store = clientDatabaseController(context);
    return clientMutation({
      networkMode: "always",
      mutationFn: async (input: UpdateDatabasePropertyValueInput) => {
        const scope = resolveDataSourceCommandScope(
          queryClient,
          store.sessionId,
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
  });
}

export type ArchiveDatabaseRowInput = RowStateInput;
export type ArchiveDatabaseRowResult = DatabaseRecordEntity;
export function archiveDatabaseRow(
  context: ClientOperationContext,
  input: ArchiveDatabaseRowInput,
): Promise<ArchiveDatabaseRowResult> {
  return runClientMutation(context, input, (context) =>
    databaseRowStateMutation(context, "row.archive"),
  );
}

export type RestoreDatabaseRowInput = RowStateInput;
export type RestoreDatabaseRowResult = DatabaseRecordEntity;
export function restoreDatabaseRow(
  context: ClientOperationContext,
  input: RestoreDatabaseRowInput,
): Promise<RestoreDatabaseRowResult> {
  return runClientMutation(context, input, (context) =>
    databaseRowStateMutation(context, "row.restore"),
  );
}

type RowStateInput = { databaseId: string; hostDatabaseId?: string; rowId: string };

function databaseRowStateMutation(
  context: ClientOperationContext,
  type: "row.archive" | "row.restore",
) {
  const { queryClient } = context;
  const store = clientDatabaseController(context);
  return clientMutation({
    networkMode: "always",
    mutationFn: async (input: RowStateInput) => {
      const scope = resolveDataSourceCommandScope(
        queryClient,
        store.sessionId,
        input.databaseId,
        input.hostDatabaseId,
      );
      const record = store
        .records(scope.dataSourceId, { includeDeleted: type === "row.restore" })
        .find(({ id }) => id === input.rowId);
      const ack = await store.submit(buildRowState(scope, input.rowId, type), [
        {
          dataSourceId: scope.dataSourceId,
          rowId: input.rowId,
          record,
          remove: type === "row.archive",
        },
      ]);
      return ack.result as DatabaseRecordEntity;
    },
  });
}
