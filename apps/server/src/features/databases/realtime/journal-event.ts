import {
  databaseMutationEventV2Schema,
  dataSourceMutationEventV3Schema,
  type DatabaseMutationEventV2,
  type DataSourceMutationEventV3,
} from "@zilobase/features/databases/contracts"

import { databaseMutationEvent } from "../../../infrastructure/database/schema"

type MutationJournalRow = typeof databaseMutationEvent.$inferSelect

type HostMutationJournalRow = Pick<
  MutationJournalRow,
  | "actorId"
  | "areas"
  | "changes"
  | "commandId"
  | "committedAt"
  | "databaseId"
  | "dataSourceId"
  | "id"
  | "protocolVersion"
  | "requiresReset"
  | "version"
>

type SourceMutationJournalRow = Pick<
  MutationJournalRow,
  | "actorId"
  | "areas"
  | "changes"
  | "commandId"
  | "committedAt"
  | "id"
  | "protocolVersion"
  | "requiresReset"
  | "sourceId"
  | "version"
>

export function databaseMutationEventFromJournalRow(
  row: HostMutationJournalRow,
): DatabaseMutationEventV2 {
  return databaseMutationEventV2Schema.parse({
    actorId: row.actorId,
    areas: row.areas,
    changes: row.changes,
    commandId: row.commandId,
    committedAt: row.committedAt.toISOString(),
    databaseId: row.databaseId,
    dataSourceId: row.dataSourceId,
    eventId: row.id,
    protocolVersion: 2,
    ...(row.requiresReset ? { requiresReset: true as const } : {}),
    type: "database.mutation",
    version: row.version,
  })
}

export function dataSourceMutationEventFromJournalRow(
  row: SourceMutationJournalRow,
): DataSourceMutationEventV3 {
  return dataSourceMutationEventV3Schema.parse({
    actorId: row.actorId,
    areas: row.areas,
    changes: row.changes,
    commandId: row.commandId,
    committedAt: row.committedAt.toISOString(),
    eventId: row.id,
    protocolVersion: 3,
    ...(row.requiresReset ? { requiresReset: true as const } : {}),
    sourceId: row.sourceId,
    sourceVersion: row.version,
    type: "database.mutation",
  })
}
