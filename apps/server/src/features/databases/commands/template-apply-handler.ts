import { and, asc, eq, isNull } from "drizzle-orm"
import { hasPageBodyContent } from "@zilobase/features/pages/content-state"
import { databaseOrderKeyAtPosition } from "@zilobase/features/databases/order-key"
import type { DataSourceCommand } from "@zilobase/features/databases/contracts"

import { encodePageContentAsYjs } from "../../collaboration/service"
import {
  dataSource,
  databaseProperty,
  databaseRow,
  favorite,
  page,
  pageCollaborationDocument,
  pageItemPlacement,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"
import {
  getStatusDefaultValue,
  normalizePropertyConfig,
  validateCellValue,
} from "../schema/config"
import { normalizeDatabasePropertyType } from "../schema/types"
import { lockDatabaseAutomationFactRows } from "../../automations/triggers/event-capture"
import type {
  DatabaseCommandContext,
  DatabaseCommandDispatchResult,
} from "./framework"
import {
  getDatabasePropertyEntity,
  getDataSourceEntity,
} from "./metadata-entities"
import { getDatabaseRecordEntity } from "./record-entity"
import { sourceMutations, sourceRecord } from "./source-command-state"

type ApplyTemplateCommand = Extract<DataSourceCommand, { type: "template.apply" }>

type TemplateProperty = {
  config: unknown
  databasePropertyId: string
  name: string
  pagePropertyId: string
  position: number
  type: string
}

export async function applyTemplate(
  context: DatabaseCommandContext,
  command: ApplyTemplateCommand,
): Promise<DatabaseCommandDispatchResult> {
  const source = await sourceRecord(context)
  const normalizedProperties = command.properties.map((property) => {
    const type = normalizeDatabasePropertyType(property.type)
    if (!type) throw new ServiceMutationError("Unsupported property type", 400)
    return {
      config: normalizePropertyConfig(type, property.config ?? null),
      name: property.name.trim() || "Property",
      type,
    }
  })
  const now = new Date()
  await context.transaction.select({ id: dataSource.id }).from(dataSource)
    .where(eq(dataSource.id, source.id)).for("update")

  const [existingProperties, existingRows, databaseFavorites] = await Promise.all([
    context.transaction.select({
      config: pageProperty.config,
      databasePropertyId: databaseProperty.id,
      name: pageProperty.name,
      pagePropertyId: pageProperty.id,
      position: databaseProperty.position,
      type: pageProperty.type,
    }).from(databaseProperty)
      .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
      .where(and(
        eq(databaseProperty.dataSourceId, source.id),
        isNull(pageProperty.deletedAt),
      )).orderBy(asc(databaseProperty.position)),
    context.transaction.select({ id: databaseRow.id }).from(databaseRow)
      .where(and(
        eq(databaseRow.dataSourceId, source.id),
        isNull(databaseRow.deletedAt),
      )).limit(1),
    context.transaction.select({ id: favorite.id }).from(favorite)
      .where(and(
        eq(favorite.userId, context.actorId),
        eq(favorite.databaseId, source.parentDatabaseId),
      )).limit(1),
  ])

  const propertiesByName = new Map<string, TemplateProperty>(
    existingProperties.map((property) => [property.name.toLowerCase(), property]),
  )
  const createdProperties: TemplateProperty[] = []
  for (const property of normalizedProperties) {
    const key = property.name.toLowerCase()
    if (propertiesByName.has(key)) continue
    const created = {
      ...property,
      databasePropertyId: crypto.randomUUID(),
      pagePropertyId: crypto.randomUUID(),
      position: existingProperties.length + createdProperties.length,
    }
    createdProperties.push(created)
    propertiesByName.set(key, created)
  }
  const propertiesById = new Map(
    [...propertiesByName.values()].map((property) => [property.pagePropertyId, property]),
  )

  await context.transaction.update(dataSource).set({
    config: command.config,
    name: command.name,
    updatedAt: now,
  }).where(eq(dataSource.id, source.id))
  if (createdProperties.length) {
    await context.transaction.insert(pageProperty).values(createdProperties.map((property) => ({
      config: property.config,
      createdAt: now,
      id: property.pagePropertyId,
      name: property.name,
      type: property.type,
      updatedAt: now,
      workspaceId: source.workspaceId,
    })))
    await context.transaction.insert(databaseProperty).values(createdProperties.map((property) => ({
      createdAt: now,
      dataSourceId: source.id,
      id: property.databasePropertyId,
      position: property.position,
      propertyId: property.pagePropertyId,
      updatedAt: now,
    })))
  }

  const createdRows = existingRows.length === 0
    ? command.rows.map((row, position) => ({
        ...row,
        pageId: crypto.randomUUID(),
        position,
        rowId: crypto.randomUUID(),
      }))
    : []
  await lockDatabaseAutomationFactRows(context.transaction, createdRows.map((row) => ({
    dataSourceId: source.id,
    rowId: row.rowId,
  })))
  if (createdRows.length) {
    await context.transaction.insert(page).values(createdRows.map((row) => ({
      content: row.content ?? null,
      createdAt: now,
      createdById: context.actorId,
      hasContent: hasPageBodyContent(row.content),
      id: row.pageId,
      metadata: row.metadata ?? null,
      name: row.title,
      type: "pageblock",
      updatedAt: now,
      url: "#",
      workspaceId: source.workspaceId,
    })))
    await context.transaction.insert(pageCollaborationDocument).values(createdRows.map((row) => ({
      createdAt: now,
      pageId: row.pageId,
      state: Buffer.from(encodePageContentAsYjs(row.content ?? null)),
      updatedAt: now,
    })))
    await context.transaction.insert(databaseRow).values(createdRows.map((row) => ({
      createdAt: now,
      createdById: context.actorId,
      dataSourceId: source.id,
      id: row.rowId,
      lastEditedById: context.actorId,
      orderKey: databaseOrderKeyAtPosition(row.position),
      pageId: row.pageId,
      updatedAt: now,
    })))
    await context.transaction.insert(pageItemPlacement).values(createdRows.map((row) => ({
      createdAt: now,
      id: crypto.randomUUID(),
      itemId: row.pageId,
      itemKind: "page",
      parentId: source.parentDatabaseId,
      parentKind: "database",
      placementKind: "database_row",
      position: row.position,
      sourceRowId: row.rowId,
      updatedAt: now,
      workspaceId: source.workspaceId,
    })))
    if (databaseFavorites.length) {
      await context.transaction.insert(favorite).values(createdRows.map((row) => ({
        id: crypto.randomUUID(),
        pageId: row.pageId,
        userId: context.actorId,
      }))).onConflictDoNothing({ target: [favorite.userId, favorite.pageId] })
    }
  }

  const createdValues: Array<{
    createdAt: Date
    id: string
    pageId: string
    propertyId: string
    updatedAt: Date
    value: unknown
  }> = []
  for (const row of createdRows) {
    const values = new Map<string, unknown>()
    for (const property of propertiesByName.values()) {
      if (property.type !== "status") continue
      const value = getStatusDefaultValue(property.config)
      if (value !== null) values.set(property.pagePropertyId, value)
    }
    for (const item of row.values) {
      const property = propertiesByName.get(item.propertyName.toLowerCase())
      if (property) values.set(property.pagePropertyId, item.value)
    }
    for (const [propertyId, value] of values) {
      const property = propertiesById.get(propertyId)
      if (!property) continue
      validateCellValue(property.type, property.config, value)
      createdValues.push({
        createdAt: now,
        id: crypto.randomUUID(),
        pageId: row.pageId,
        propertyId,
        updatedAt: now,
        value,
      })
    }
  }
  if (createdValues.length) {
    await context.transaction.insert(pagePropertyValue).values(createdValues)
  }

  const propertyEntities = []
  for (const property of createdProperties) {
    propertyEntities.push(await getDatabasePropertyEntity(context, property.databasePropertyId))
  }
  const recordEntities = []
  for (const row of createdRows) {
    recordEntities.push(await getDatabaseRecordEntity(context.transaction, source.id, row.rowId))
  }
  const dataSourceEntity = await getDataSourceEntity(context, context.databaseId, source.id)
  const changes = {
    dataSources: [dataSourceEntity],
    ...(propertyEntities.length ? { properties: propertyEntities } : {}),
    ...(recordEntities.length ? { records: recordEntities } : {}),
  }
  return {
    automationFacts: createdRows.map((row) => ({
      actorId: context.actorId,
      changedValues: [
        { after: row.title, before: null, propertyId: "name" },
        ...createdValues.filter((value) => value.pageId === row.pageId).map((value) => ({
          after: value.value,
          before: null,
          propertyId: value.propertyId,
        })),
      ],
      dataSourceId: source.id,
      origin: "import" as const,
      pageId: row.pageId,
      rowAdded: true,
      rowId: row.rowId,
    })),
    mutations: await sourceMutations(
      context,
      ["dataSources", ...(propertyEntities.length ? ["properties" as const] : []), ...(recordEntities.length ? ["records" as const] : [])],
      async () => changes,
    ),
    result: { dataSource: dataSourceEntity },
  }
}
