import {
  databaseMutationEventV2Schema,
  type DatabaseMutationEventV2,
} from "@zilobase/features/databases/contracts"

import { databaseMutationEvent } from "../../../infrastructure/database/schema"

export function databaseMutationEventFromJournalRow(
  row: typeof databaseMutationEvent.$inferSelect,
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
