import { eq } from "drizzle-orm"
import type { HostDatabaseCommand } from "@zilobase/features/databases/contracts"

import { database } from "../../../../infrastructure/database/schema"
import type { DatabaseCommandContext, DatabaseCommandDispatchResult } from "../framework"
import { getDatabaseHostEntity } from "../metadata-entities"

export async function databaseUpdate(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "database.update" }>,
): Promise<DatabaseCommandDispatchResult> {
  await context.transaction.update(database).set({
    ...(command.patch.config !== undefined ? { config: command.patch.config } : {}),
    ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
    updatedAt: new Date(),
  }).where(eq(database.id, context.databaseId))
  const entity = await getDatabaseHostEntity(context, context.databaseId)
  return {
    mutations: [{ areas: ["databases"], changes: { databases: [entity] }, databaseId: context.databaseId, dataSourceId: null }],
    result: entity,
  }
}
