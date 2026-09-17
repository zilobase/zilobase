import { and, asc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm"
import type { DataSourceCommand, DatabasePropertyEntity, DatabaseRecordEntity } from "@zilobase/features/databases/contracts"

import { databaseProperty, databaseRow, pageProperty, pagePropertyValue } from "../../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error"
import { updateDatabasePropertyPositions } from "../../core/position-service"
import { normalizePropertyConfig } from "../../schema/config"
import { normalizeDatabasePropertyType } from "../../schema/types"
import { getDuplicatePropertyName } from "../../schema/import"
import type { DatabaseCommandContext } from "../framework"
import { getDatabasePropertyEntity } from "../metadata-entities"
import { getDatabaseRecordEntity } from "../record-entity"
import { sourceMutations, sourceRecord } from "../source-command-state"
import { resolveNeighborIndex } from "./ordering"

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

export async function propertyCreate(
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

export async function propertyUpdate(
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

export async function propertyMove(
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

export async function propertyState(
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

export async function propertyDuplicate(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "property.duplicate" }>,
) {
  const source = await sourceRecord(context)
  const [record] = await context.transaction
    .select({ column: databaseProperty, property: pageProperty })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(and(
      eq(databaseProperty.id, command.propertyId),
      eq(databaseProperty.dataSourceId, source.id),
      eq(pageProperty.workspaceId, source.workspaceId),
      isNull(pageProperty.deletedAt),
    ))
    .limit(1)
  if (!record) throw new ServiceMutationError("Property not found", 404)

  const existing = await context.transaction
    .select({ id: databaseProperty.id, name: pageProperty.name, position: databaseProperty.position })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(and(
      eq(databaseProperty.dataSourceId, source.id),
      eq(pageProperty.workspaceId, source.workspaceId),
      isNull(pageProperty.deletedAt),
    ))
    .orderBy(asc(databaseProperty.position), asc(databaseProperty.id))
  const copiedValues = command.includeValues
    ? await context.transaction
        .select({ pageId: pagePropertyValue.pageId, rowId: databaseRow.id, value: pagePropertyValue.value })
        .from(pagePropertyValue)
        .innerJoin(databaseRow, eq(pagePropertyValue.pageId, databaseRow.pageId))
        .where(and(
          eq(pagePropertyValue.propertyId, record.property.id),
          eq(databaseRow.dataSourceId, source.id),
          isNull(databaseRow.deletedAt),
        ))
    : []
  const targetPosition = record.column.position + 1
  const now = new Date()
  const pagePropertyId = crypto.randomUUID()
  const databasePropertyId = crypto.randomUUID()
  const name = getDuplicatePropertyName(
    record.property.name,
    new Set(existing.map((property) => property.name)),
  )
  await context.transaction.update(databaseProperty).set({
    position: sql`${databaseProperty.position} + 1`,
    updatedAt: now,
  }).where(and(
    eq(databaseProperty.dataSourceId, source.id),
    gte(databaseProperty.position, targetPosition),
  ))
  await context.transaction.insert(pageProperty).values({
    config: record.property.config,
    createdAt: now,
    id: pagePropertyId,
    name,
    type: record.property.type,
    updatedAt: now,
    workspaceId: source.workspaceId,
  })
  await context.transaction.insert(databaseProperty).values({
    createdAt: now,
    dataSourceId: source.id,
    id: databasePropertyId,
    position: targetPosition,
    propertyId: pagePropertyId,
    updatedAt: now,
  })
  if (copiedValues.length) {
    await context.transaction.insert(pagePropertyValue).values(copiedValues.map((value) => ({
      createdAt: now,
      id: crypto.randomUUID(),
      pageId: value.pageId,
      propertyId: pagePropertyId,
      updatedAt: now,
      value: value.value,
    })))
  }
  const properties: DatabasePropertyEntity[] = []
  for (const item of await orderedProperties(context)) {
    properties.push(await getDatabasePropertyEntity(context, item.id))
  }
  const records: DatabaseRecordEntity[] = []
  for (const item of copiedValues) {
    records.push(await getDatabaseRecordEntity(context.transaction, source.id, item.rowId))
  }
  const entity = properties.find(({ id }) => id === databasePropertyId)!
  return {
    mutations: await sourceMutations(
      context,
      records.length ? ["properties", "records"] : ["properties"],
      async () => ({ properties, ...(records.length ? { records } : {}) }),
    ),
    result: entity,
  }
}
