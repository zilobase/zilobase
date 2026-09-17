import { and, eq } from "drizzle-orm"

import { databaseDataSource, databaseView } from "../../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error"
import type { DatabaseCommandContext } from "../framework"

export function resolveNeighborIndex(input: {
  afterId: string | null
  beforeId: string | null
  ids: string[]
  movingId?: string
}) {
  const ids = input.ids.filter((id) => id !== input.movingId)
  const beforeIndex = input.beforeId ? ids.indexOf(input.beforeId) : -1
  const afterIndex = input.afterId ? ids.indexOf(input.afterId) : -1
  if (beforeIndex >= 0 && afterIndex >= 0) {
    if (afterIndex >= beforeIndex) {
      throw new ServiceMutationError("Ordering anchors conflict", 409)
    }
    return { ids, index: afterIndex + 1 }
  }
  if (beforeIndex >= 0) return { ids, index: beforeIndex }
  if (afterIndex >= 0) return { ids, index: afterIndex + 1 }
  if (input.beforeId || input.afterId) {
    throw new ServiceMutationError("Ordering anchors conflict", 409)
  }
  return { ids, index: ids.length }
}

export async function updateViewPositions(
  context: DatabaseCommandContext,
  databaseId: string,
  ids: string[],
  now: Date,
) {
  for (const [position, id] of ids.entries()) {
    await context.transaction.update(databaseView).set({ position, updatedAt: now })
      .where(and(eq(databaseView.id, id), eq(databaseView.databaseId, databaseId)))
  }
}

export async function updateLinkPositions(
  context: DatabaseCommandContext,
  databaseId: string,
  ids: string[],
  now: Date,
) {
  for (const [position, id] of ids.entries()) {
    await context.transaction.update(databaseDataSource).set({ position, updatedAt: now })
      .where(and(
        eq(databaseDataSource.databaseId, databaseId),
        eq(databaseDataSource.dataSourceId, id),
      ))
  }
}
