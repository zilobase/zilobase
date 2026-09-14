import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm"
import type {
  DataSourceCommand,
  DatabaseChangedAreaV2,
  DatabaseMutationChanges,
  HostDatabaseCommand,
} from "@zilobase/features/databases/contracts"

import {
  dataSource,
  database,
  databaseDataSource,
  databaseProperty,
  databaseView,
  pageProperty,
} from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"
import { updateDatabasePropertyPositions } from "../core/position-service"
import { normalizePropertyConfig } from "../properties/config"
import { normalizeDatabasePropertyType } from "../properties/types"
import type {
  DatabaseCommandContext,
  DatabaseCommandDispatchResult,
  DatabaseCommandMutation,
} from "./framework"
import {
  getDatabaseHostEntity,
  getDatabasePropertyEntity,
  getDatabaseViewEntity,
  getDataSourceEntity,
} from "./metadata-entities"

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

async function updateViewPositions(
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

async function updateLinkPositions(
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

async function sourceMutations(
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

async function sourceRecord(context: DatabaseCommandContext) {
  const [source] = await context.transaction.select().from(dataSource)
    .where(eq(dataSource.id, context.dataSourceId!)).limit(1)
  if (!source) throw new ServiceMutationError("Data source not found", 404)
  return source
}

async function dataSourceUpdate(
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

async function orderedProperties(context: DatabaseCommandContext) {
  return context.transaction
    .select({ id: databaseProperty.id })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
    .where(and(
      eq(databaseProperty.dataSourceId, context.dataSourceId!),
      isNull(pageProperty.deletedAt),
    ))
    .orderBy(asc(databaseProperty.position), asc(databaseProperty.id))
}

async function propertyCreate(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "property.create" }>,
) {
  const source = await sourceRecord(context)
  const type = normalizeDatabasePropertyType(command.propertyType)
  if (!type) throw new ServiceMutationError("Unsupported property type", 400)
  const ordered = await orderedProperties(context)
  const placement = resolveNeighborIndex({
    afterId: command.afterPropertyId,
    beforeId: command.beforePropertyId,
    ids: ordered.map(({ id }) => id),
  })
  const now = new Date()
  const propertyId = crypto.randomUUID()
  const columnId = crypto.randomUUID()
  await context.transaction.insert(pageProperty).values({
    config: normalizePropertyConfig(type, command.config),
    createdAt: now,
    id: propertyId,
    name: command.name.trim() || "Property",
    type,
    updatedAt: now,
    workspaceId: source.workspaceId,
  })
  await context.transaction.insert(databaseProperty).values({
    createdAt: now,
    dataSourceId: source.id,
    id: columnId,
    position: placement.index,
    propertyId,
    updatedAt: now,
  })
  const ids = [...placement.ids]
  ids.splice(placement.index, 0, columnId)
  await updateDatabasePropertyPositions(context.transaction, source.id, ids, now)
  const entity = await getDatabasePropertyEntity(context, columnId)
  const entities: Awaited<ReturnType<typeof getDatabasePropertyEntity>>[] = []
  for (const id of ids) entities.push(await getDatabasePropertyEntity(context, id))
  return {
    mutations: await sourceMutations(context, ["properties"], async () => ({ properties: entities })),
    result: entity,
  }
}

async function propertyUpdate(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "property.update" }>,
) {
  const [record] = await context.transaction
    .select({ column: databaseProperty, property: pageProperty })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
    .where(and(
      eq(databaseProperty.id, command.propertyId),
      eq(databaseProperty.dataSourceId, context.dataSourceId!),
      isNull(pageProperty.deletedAt),
    )).limit(1)
  if (!record) throw new ServiceMutationError("Property not found", 404)
  const type = command.patch.type === undefined
    ? record.property.type
    : normalizeDatabasePropertyType(command.patch.type)
  if (!type) throw new ServiceMutationError("Unsupported property type", 400)
  const now = new Date()
  await context.transaction.update(pageProperty).set({
    ...(command.patch.config !== undefined
      ? { config: normalizePropertyConfig(type, command.patch.config) }
      : {}),
    ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
    ...(command.patch.type !== undefined ? { type } : {}),
    updatedAt: now,
  }).where(eq(pageProperty.id, record.property.id))
  await context.transaction.update(databaseProperty).set({
    ...(command.patch.visible !== undefined ? { visible: command.patch.visible } : {}),
    ...(command.patch.width !== undefined ? { width: command.patch.width } : {}),
    updatedAt: now,
  }).where(eq(databaseProperty.id, record.column.id))
  const entity = await getDatabasePropertyEntity(context, record.column.id)
  return {
    mutations: await sourceMutations(
      context,
      ["properties"],
      async () => ({ properties: [entity] }),
      command.patch.type !== undefined && type !== record.property.type,
    ),
    result: entity,
  }
}

async function propertyMove(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "property.move" }>,
) {
  const ordered = await orderedProperties(context)
  if (!ordered.some(({ id }) => id === command.propertyId)) {
    throw new ServiceMutationError("Property not found", 404)
  }
  const placement = resolveNeighborIndex({
    afterId: command.afterPropertyId,
    beforeId: command.beforePropertyId,
    ids: ordered.map(({ id }) => id),
    movingId: command.propertyId,
  })
  placement.ids.splice(placement.index, 0, command.propertyId)
  await updateDatabasePropertyPositions(
    context.transaction,
    context.dataSourceId!,
    placement.ids,
    new Date(),
  )
  const entities: Awaited<ReturnType<typeof getDatabasePropertyEntity>>[] = []
  for (const id of placement.ids) entities.push(await getDatabasePropertyEntity(context, id))
  return {
    mutations: await sourceMutations(context, ["properties"], async () => ({ properties: entities })),
    result: await getDatabasePropertyEntity(context, command.propertyId),
  }
}

async function propertyState(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "property.archive" | "property.restore" }>,
) {
  const restore = command.type === "property.restore"
  const [record] = await context.transaction
    .select({ columnId: databaseProperty.id, propertyId: pageProperty.id })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
    .where(and(
      eq(databaseProperty.id, command.propertyId),
      eq(databaseProperty.dataSourceId, context.dataSourceId!),
      restore ? isNotNull(pageProperty.deletedAt) : isNull(pageProperty.deletedAt),
    )).limit(1)
  if (!record) throw new ServiceMutationError("Property not found", 404)
  const now = new Date()
  await context.transaction.update(pageProperty).set({
    deletedAt: restore ? null : now,
    deletedById: restore ? null : context.actorId,
    updatedAt: now,
  }).where(eq(pageProperty.id, record.propertyId))
  const ordered = await orderedProperties(context)
  await updateDatabasePropertyPositions(
    context.transaction,
    context.dataSourceId!,
    ordered.map(({ id }) => id),
    now,
  )
  const entity = await getDatabasePropertyEntity(context, record.columnId)
  const entities: Awaited<ReturnType<typeof getDatabasePropertyEntity>>[] = []
  for (const property of ordered) {
    entities.push(await getDatabasePropertyEntity(context, property.id))
  }
  return {
    mutations: await sourceMutations(context, ["properties"], async () =>
      restore
        ? { properties: entities }
        : { properties: entities, removedPropertyIds: [entity.id] }
    ),
    result: entity,
  }
}

type StoredTemplate = {
  archivedAt: string | null
  id: string
  name: string
  template: unknown
}

function templatesFromConfig(config: unknown): StoredTemplate[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return []
  const templates = (config as { templates?: unknown }).templates
  if (!Array.isArray(templates)) return []
  return templates.filter((item): item is StoredTemplate =>
    Boolean(item && typeof item === "object" && typeof (item as StoredTemplate).id === "string")
  )
}

async function templateWrite(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "template.create" | "template.update" | "template.archive" | "template.restore" }>,
) {
  const source = await sourceRecord(context)
  const config = source.config && typeof source.config === "object" && !Array.isArray(source.config)
    ? { ...source.config as Record<string, unknown> }
    : {}
  const templates = templatesFromConfig(config)
  let result: StoredTemplate
  if (command.type === "template.create") {
    result = { archivedAt: null, id: crypto.randomUUID(), name: command.name, template: command.template }
    templates.push(result)
  } else {
    const index = templates.findIndex(({ id }) => id === command.templateId)
    if (index < 0) throw new ServiceMutationError("Template not found", 404)
    const current = templates[index]!
    if (command.type === "template.update") {
      const template = current.template && typeof current.template === "object" && !Array.isArray(current.template) && command.patch && typeof command.patch === "object" && !Array.isArray(command.patch)
        ? { ...current.template as Record<string, unknown>, ...command.patch as Record<string, unknown> }
        : command.patch
      result = { ...current, template }
    } else {
      result = { ...current, archivedAt: command.type === "template.archive" ? new Date().toISOString() : null }
    }
    templates[index] = result
  }
  await context.transaction.update(dataSource).set({
    config: { ...config, templates },
    configVersion: sql`${dataSource.configVersion} + 1`,
    updatedAt: new Date(),
  }).where(eq(dataSource.id, source.id))
  return {
    mutations: await sourceMutations(context, ["dataSources"], async (databaseId) => ({
      dataSources: [await getDataSourceEntity(context, databaseId, source.id)],
    })),
    result,
  }
}

async function databaseUpdate(
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

async function dataSourceLink(
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

async function dataSourceUnlink(
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

async function orderedViews(context: DatabaseCommandContext) {
  return context.transaction.select({ id: databaseView.id }).from(databaseView)
    .where(eq(databaseView.databaseId, context.databaseId))
    .orderBy(asc(databaseView.position), asc(databaseView.id))
}

async function viewCreate(
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

async function viewUpdate(
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

async function viewMove(
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

async function viewDelete(
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

export async function dispatchStructuralCommand(
  context: DatabaseCommandContext,
  command: HostDatabaseCommand | DataSourceCommand,
): Promise<DatabaseCommandDispatchResult | null> {
  switch (command.type) {
    case "database.update": return databaseUpdate(context, command)
    case "dataSource.link": return dataSourceLink(context, command)
    case "dataSource.unlink": return dataSourceUnlink(context, command)
    case "view.create": return viewCreate(context, command)
    case "view.update": return viewUpdate(context, command)
    case "view.move": return viewMove(context, command)
    case "view.delete": return viewDelete(context, command)
    case "dataSource.update": return dataSourceUpdate(context, command)
    case "property.create": return propertyCreate(context, command)
    case "property.update": return propertyUpdate(context, command)
    case "property.move": return propertyMove(context, command)
    case "property.archive":
    case "property.restore": return propertyState(context, command)
    case "template.create":
    case "template.update":
    case "template.archive":
    case "template.restore": return templateWrite(context, command)
    default: return null
  }
}
