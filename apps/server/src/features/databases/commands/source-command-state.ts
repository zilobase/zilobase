import { eq } from "drizzle-orm"
import type {
  DatabaseChangedAreaV2,
  DatabaseMutationChanges,
} from "@zilobase/features/databases/contracts"

import {
  dataSource,
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
  return [{
    areas,
    changes: await changes(context.databaseId),
    databaseId: context.databaseId,
    dataSourceId: context.dataSourceId,
    ...(requiresReset ? { requiresReset: true as const } : {}),
  }]
}

export async function sourceRecord(context: DatabaseCommandContext) {
  const [source] = await context.transaction.select().from(dataSource)
    .where(eq(dataSource.id, context.dataSourceId!)).limit(1)
  if (!source) throw new ServiceMutationError("Data source not found", 404)
  return source
}
