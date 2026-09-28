import { eq } from "drizzle-orm";
import { applyConfigurationChanges } from "@zilobase/features/databases/record-interactions";
import type { HostDatabaseCommand } from "@zilobase/features/databases/contracts";

import { database } from "../../../../infrastructure/database/schema";
import type { DatabaseCommandContext, DatabaseCommandDispatchResult } from "../framework";
import { getDatabaseHostEntity } from "../metadata-entities";

export async function databaseUpdate(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "database.update" }>,
): Promise<DatabaseCommandDispatchResult> {
  const previous = await getDatabaseHostEntity(context, context.databaseId);
  await context.transaction
    .update(database)
    .set({
      ...(command.patch.configuration
        ? { config: applyConfigurationChanges(previous.config, command.patch.configuration) }
        : {}),
      ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
      updatedAt: new Date(),
    })
    .where(eq(database.id, context.databaseId));
  const entity = await getDatabaseHostEntity(context, context.databaseId);
  return {
    mutations: [
      {
        areas: ["databases"],
        changes: { databases: [entity] },
        databaseId: context.databaseId,
        dataSourceId: null,
      },
    ],
    result: entity,
  };
}
