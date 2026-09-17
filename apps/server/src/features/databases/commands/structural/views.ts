import { and, asc, eq } from "drizzle-orm"
import type { HostDatabaseCommand } from "@zilobase/features/databases/contracts"

import { databaseDataSource, databaseView } from "../../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error"
import type { DatabaseCommandContext, DatabaseCommandDispatchResult } from "../framework"
import { getDatabaseViewEntity } from "../metadata-entities"
import { resolveNeighborIndex, updateViewPositions } from "./ordering"

export async function orderedViews(context: DatabaseCommandContext) {
  return context.transaction.select({ id: databaseView.id }).from(databaseView)
    .where(eq(databaseView.databaseId, context.databaseId))
    .orderBy(asc(databaseView.position), asc(databaseView.id))
}

export async function viewCreate(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "view.create" }>,
): Promise<DatabaseCommandDispatchResult> {
  const [link] = await context.transaction.select({ id: databaseDataSource.dataSourceId })
    .from(databaseDataSource).where(and(
      eq(databaseDataSource.databaseId, context.databaseId),
      eq(databaseDataSource.dataSourceId, command.dataSourceId),
    )).limit(1)
  if (!link) throw new ServiceMutationError("Data source is not linked", 404)
  const ordered = await orderedViews(context)
  const placement = resolveNeighborIndex({
    afterId: command.afterViewId,
    beforeId: command.beforeViewId,
    ids: ordered.map(({ id }) => id),
  })
  const now = new Date()
  const viewId = crypto.randomUUID()
  await context.transaction.insert(databaseView).values({
    config: command.config,
    createdAt: now,
    databaseId: context.databaseId,
    dataSourceId: command.dataSourceId,
    id: viewId,
    name: command.name,
    position: placement.index,
    type: command.viewType,
    updatedAt: now,
  })
  placement.ids.splice(placement.index, 0, viewId)
  await updateViewPositions(context, context.databaseId, placement.ids, now)
  const entity = await getDatabaseViewEntity(context, viewId)
  const entities = []
  for (const id of placement.ids) entities.push(await getDatabaseViewEntity(context, id))
  return {
    mutations: [{ areas: ["views"], changes: { views: entities }, databaseId: context.databaseId, dataSourceId: command.dataSourceId }],
    result: entity,
  }
}

export async function viewUpdate(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "view.update" }>,
): Promise<DatabaseCommandDispatchResult> {
  const [view] = await context.transaction.select().from(databaseView).where(and(
    eq(databaseView.id, command.viewId), eq(databaseView.databaseId, context.databaseId),
  )).limit(1)
  if (!view) throw new ServiceMutationError("Database view not found", 404)
  await context.transaction.update(databaseView).set({
    ...(command.patch.config !== undefined ? { config: command.patch.config } : {}),
    ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
    ...(command.patch.type !== undefined ? { type: command.patch.type } : {}),
    updatedAt: new Date(),
  }).where(eq(databaseView.id, view.id))
  const entity = await getDatabaseViewEntity(context, view.id)
  return {
    mutations: [{ areas: ["views"], changes: { views: [entity] }, databaseId: context.databaseId, dataSourceId: view.dataSourceId }],
    result: entity,
  }
}

export async function viewMove(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "view.move" }>,
): Promise<DatabaseCommandDispatchResult> {
  const ordered = await orderedViews(context)
  if (!ordered.some(({ id }) => id === command.viewId)) {
    throw new ServiceMutationError("Database view not found", 404)
  }
  const placement = resolveNeighborIndex({
    afterId: command.afterViewId,
    beforeId: command.beforeViewId,
    ids: ordered.map(({ id }) => id),
    movingId: command.viewId,
  })
  placement.ids.splice(placement.index, 0, command.viewId)
  await updateViewPositions(context, context.databaseId, placement.ids, new Date())
  const entity = await getDatabaseViewEntity(context, command.viewId)
  const entities = []
  for (const id of placement.ids) entities.push(await getDatabaseViewEntity(context, id))
  return {
    mutations: [{ areas: ["views"], changes: { views: entities }, databaseId: context.databaseId, dataSourceId: entity.dataSourceId }],
    result: entity,
  }
}

export async function viewDelete(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "view.delete" }>,
): Promise<DatabaseCommandDispatchResult> {
  const ordered = await orderedViews(context)
  if (!ordered.some(({ id }) => id === command.viewId)) {
    throw new ServiceMutationError("Database view not found", 404)
  }
  if (ordered.length <= 1) {
    throw new ServiceMutationError("The last view cannot be deleted. A database must always have one view.", 409)
  }
  await context.transaction.delete(databaseView).where(and(
    eq(databaseView.id, command.viewId),
    eq(databaseView.databaseId, context.databaseId),
  ))
  const remaining = ordered.filter(({ id }) => id !== command.viewId).map(({ id }) => id)
  await updateViewPositions(context, context.databaseId, remaining, new Date())
  const entities = []
  for (const id of remaining) entities.push(await getDatabaseViewEntity(context, id))
  return {
    mutations: [{ areas: ["views"], changes: { views: entities, removedViewIds: [command.viewId] }, databaseId: context.databaseId, dataSourceId: null }],
    result: { viewId: command.viewId },
  }
}

