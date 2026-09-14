import { eq } from "drizzle-orm"
import type {
  DatabaseChangedAreaV2,
  DatabaseMutationChanges,
} from "@zilobase/features/databases/contracts"

import {
  dataSource,
  databaseDataSource,
} from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"
import type {
  DatabaseCommandContext,
  DatabaseCommandMutation,
} from "./framework"

export async function sourceMutations(
  context: DatabaseCommandContext,
  areas: DatabaseChangedAreaV2[],
  changes: (databaseId: string) => Promise<DatabaseMutationChanges>,
  requiresReset = false,
): Promise<DatabaseCommandMutation[]> {
  const links = await context.transaction
    .select({ databaseId: databaseDataSource.databaseId })
    .from(databaseDataSource)
    .where(eq(databaseDataSource.dataSourceId, context.dataSourceId!))
  const mutations: DatabaseCommandMutation[] = []
  for (const link of links) {
    mutations.push({
      areas,
      changes: await changes(link.databaseId),
      databaseId: link.databaseId,
      dataSourceId: context.dataSourceId,
      ...(requiresReset ? { requiresReset: true as const } : {}),
    })
  }
  return mutations
}

export async function sourceRecord(context: DatabaseCommandContext) {
  const [source] = await context.transaction.select().from(dataSource)
    .where(eq(dataSource.id, context.dataSourceId!)).limit(1)
  if (!source) throw new ServiceMutationError("Data source not found", 404)
  return source
}
