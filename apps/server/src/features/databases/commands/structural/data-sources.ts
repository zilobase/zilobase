import { and, asc, eq, sql } from "drizzle-orm"
import type { DataSourceCommand, HostDatabaseCommand } from "@zilobase/features/databases/contracts"

import { database, dataSource, databaseDataSource, databaseView } from "../../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error"
import { getNextDatabaseViewName } from "../../views/naming"
import type { DatabaseCommandContext, DatabaseCommandDispatchResult } from "../framework"
import { getDataSourceEntity, getDatabaseViewEntity } from "../metadata-entities"
import { sourceMutations } from "../source-command-state"
import { resolveNeighborIndex, updateLinkPositions } from "./ordering"
import { orderedViews } from "./views"

export async function dataSourceUpdate(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "dataSource.update" }>,
) {
  const now = new Date()
  await context.transaction.update(dataSource).set({
    ...(command.patch.config !== undefined
      ? { config: command.patch.config, configVersion: sql`${dataSource.configVersion} + 1` }
      : {}),
    ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
    updatedAt: now,
  }).where(eq(dataSource.id, context.dataSourceId!))
  return {
    mutations: await sourceMutations(context, ["dataSources"], async (databaseId) => ({
      dataSources: [await getDataSourceEntity(context, databaseId, context.dataSourceId!)],
    })),
    result: await getDataSourceEntity(context, context.databaseId, context.dataSourceId!),
  }
}

export async function dataSourceCreate(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "dataSource.create" }>,
): Promise<DatabaseCommandDispatchResult> {
  const [host] = await context.transaction.select().from(database)
    .where(eq(database.id, context.databaseId)).limit(1)
  if (!host) throw new ServiceMutationError("Database not found", 404)
  const [views, links] = await Promise.all([
    orderedViews(context),
    context.transaction.select({ id: databaseDataSource.dataSourceId })
      .from(databaseDataSource)
      .where(eq(databaseDataSource.databaseId, host.id))
      .orderBy(asc(databaseDataSource.position), asc(databaseDataSource.dataSourceId)),
  ])
  const existingViewNames = await context.transaction
    .select({ name: databaseView.name })
    .from(databaseView)
    .where(eq(databaseView.databaseId, host.id))
  const now = new Date()
  const dataSourceId = crypto.randomUUID()
  const viewId = crypto.randomUUID()
  await context.transaction.insert(dataSource).values({
    config: command.config,
    createdAt: now,
    createdById: context.actorId,
    id: dataSourceId,
    name: command.name.trim() || "New data source",
    parentDatabaseId: host.id,
    updatedAt: now,
    workspaceId: host.workspaceId,
  })
  await context.transaction.insert(databaseDataSource).values({
    createdAt: now,
    databaseId: host.id,
    dataSourceId,
    linkedById: context.actorId,
    position: links.length,
    updatedAt: now,
  })
  await context.transaction.insert(databaseView).values({
    config: null,
    createdAt: now,
    databaseId: host.id,
    dataSourceId,
    id: viewId,
    name: getNextDatabaseViewName(
      command.viewName.trim() || "Table",
      new Set(existingViewNames.map(({ name }) => name)),
    ),
    position: views.length,
    type: command.viewType,
    updatedAt: now,
  })
  const sourceEntity = await getDataSourceEntity(context, host.id, dataSourceId)
  const viewEntity = await getDatabaseViewEntity(context, viewId)
  return {
    mutations: [{
      areas: ["dataSources", "views"],
      changes: { dataSources: [sourceEntity], views: [viewEntity] },
      databaseId: host.id,
      dataSourceId,
    }],
    result: { dataSource: sourceEntity, view: viewEntity },
  }
}

export async function dataSourceLink(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "dataSource.link" }>,
): Promise<DatabaseCommandDispatchResult> {
  const [host] = await context.transaction.select().from(database)
    .where(eq(database.id, context.databaseId)).limit(1)
  const [source] = await context.transaction.select().from(dataSource)
    .where(eq(dataSource.id, command.dataSourceId)).limit(1)
  if (!host || !source || host.workspaceId !== source.workspaceId) {
    throw new ServiceMutationError("Data source not found", 404)
  }
  const links = await context.transaction.select({ id: databaseDataSource.dataSourceId })
    .from(databaseDataSource).where(eq(databaseDataSource.databaseId, host.id))
    .orderBy(asc(databaseDataSource.position), asc(databaseDataSource.dataSourceId))
  if (links.some(({ id }) => id === source.id)) {
    throw new ServiceMutationError("Data source is already linked", 409)
  }
  const placement = resolveNeighborIndex({
    afterId: command.afterId,
    beforeId: command.beforeId,
    ids: links.map(({ id }) => id),
  })
  const now = new Date()
  await context.transaction.insert(databaseDataSource).values({
    createdAt: now,
    databaseId: host.id,
    dataSourceId: source.id,
    linkedById: context.actorId,
    position: placement.index,
    updatedAt: now,
  })
  placement.ids.splice(placement.index, 0, source.id)
  await updateLinkPositions(context, host.id, placement.ids, now)
  const entity = await getDataSourceEntity(context, host.id, source.id)
  const entities = []
  for (const id of placement.ids) entities.push(await getDataSourceEntity(context, host.id, id))
  return {
    mutations: [{ areas: ["dataSources"], changes: { dataSources: entities }, databaseId: host.id, dataSourceId: source.id }],
    result: entity,
  }
}

export async function viewSetDataSource(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "view.setDataSource" }>,
): Promise<DatabaseCommandDispatchResult> {
  const [host] = await context.transaction.select().from(database)
    .where(eq(database.id, context.databaseId)).limit(1)
  const [source] = await context.transaction.select().from(dataSource)
    .where(eq(dataSource.id, command.dataSourceId)).limit(1)
  const [view] = await context.transaction.select().from(databaseView).where(and(
    eq(databaseView.id, command.viewId),
    eq(databaseView.databaseId, context.databaseId),
  )).limit(1)
  if (!host || !source || source.workspaceId !== host.workspaceId) {
    throw new ServiceMutationError("Data source not found", 404)
  }
  if (!view) throw new ServiceMutationError("Database view not found", 404)

  const links = await context.transaction.select({ id: databaseDataSource.dataSourceId })
    .from(databaseDataSource)
    .where(eq(databaseDataSource.databaseId, host.id))
    .orderBy(asc(databaseDataSource.position), asc(databaseDataSource.dataSourceId))
  const alreadyLinked = links.some(({ id }) => id === source.id)
  const now = new Date()
  if (!alreadyLinked) {
    await context.transaction.insert(databaseDataSource).values({
      createdAt: now,
      databaseId: host.id,
      dataSourceId: source.id,
      linkedById: context.actorId,
      position: links.length,
      updatedAt: now,
    })
  }
  await context.transaction.update(databaseView).set({
    dataSourceId: source.id,
    updatedAt: now,
  }).where(eq(databaseView.id, view.id))
  const sourceEntity = await getDataSourceEntity(context, host.id, source.id)
  const viewEntity = await getDatabaseViewEntity(context, view.id)
  return {
    mutations: [{
      areas: alreadyLinked ? ["views"] : ["dataSources", "views"],
      changes: {
        ...(alreadyLinked ? {} : { dataSources: [sourceEntity] }),
        views: [viewEntity],
      },
      databaseId: host.id,
      dataSourceId: source.id,
    }],
    result: viewEntity,
  }
}

export async function dataSourceUnlink(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "dataSource.unlink" }>,
): Promise<DatabaseCommandDispatchResult> {
  const [source] = await context.transaction.select().from(dataSource)
    .where(eq(dataSource.id, command.dataSourceId)).limit(1)
  if (!source) throw new ServiceMutationError("Data source link not found", 404)
  if (source.parentDatabaseId === context.databaseId) {
    throw new ServiceMutationError("Owned data sources cannot be unlinked", 409)
  }
  const views = await context.transaction.select({ id: databaseView.id }).from(databaseView)
    .where(and(
      eq(databaseView.databaseId, context.databaseId),
      eq(databaseView.dataSourceId, source.id),
    ))
  if (views.length) {
    throw new ServiceMutationError("Move or delete views that use this data source before unlinking it", 409)
  }
  const links = await context.transaction.select({ id: databaseDataSource.dataSourceId })
    .from(databaseDataSource).where(eq(databaseDataSource.databaseId, context.databaseId))
    .orderBy(asc(databaseDataSource.position), asc(databaseDataSource.dataSourceId))
  if (!links.some(({ id }) => id === source.id)) {
    throw new ServiceMutationError("Data source link not found", 404)
  }
  await context.transaction.delete(databaseDataSource).where(and(
    eq(databaseDataSource.databaseId, context.databaseId),
    eq(databaseDataSource.dataSourceId, source.id),
  ))
  await updateLinkPositions(
    context,
    context.databaseId,
    links.filter(({ id }) => id !== source.id).map(({ id }) => id),
    new Date(),
  )
  const remainingIds = links.filter(({ id }) => id !== source.id).map(({ id }) => id)
  const entities = []
  for (const id of remainingIds) {
    entities.push(await getDataSourceEntity(context, context.databaseId, id))
  }
  return {
    mutations: [{ areas: ["dataSources"], changes: { dataSources: entities, removedDataSourceIds: [source.id] }, databaseId: context.databaseId, dataSourceId: source.id }],
    result: { dataSourceId: source.id },
  }
}
