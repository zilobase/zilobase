import { and, eq, inArray, isNull, sql } from "drizzle-orm"

import {
  dataSource,
  databaseProperty,
  databaseRow,
  pageProperty,
  pagePropertyValue,
} from "../../../../infrastructure/database/schema"
import { upsertPagePropertyValues } from "../../../pages/properties/upsert"
import { requireDataSourceEditAccess } from "../../access/data-source-access"
import type { DatabaseCommandContext } from "../framework"
import { getDatabasePropertyEntity } from "../metadata-entities"
import { getDatabaseRecordEntity } from "../record-entity"

type SubItemRole = "parent-item" | "sub-item"

function requestedSubItems(config: unknown): Record<string, unknown> | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null
  const value = (config as { subItems?: unknown }).subItems
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function relationRole(config: unknown): SubItemRole | null {
  const role = requestedSubItems(config)?.role
  return role === "parent-item" || role === "sub-item" ? role : null
}

function pageIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string" && id.length > 0)
  }
  return typeof value === "string" && value ? [value] : []
}

export async function ensureSubItemRelations(
  context: DatabaseCommandContext,
  dataSourceId: string,
  config: unknown,
) {
  const subItems = requestedSubItems(config)
  if (
    !subItems ||
    subItems.enabled !== true ||
    (typeof subItems.parentPropertyId === "string" && subItems.parentPropertyId &&
      typeof subItems.subItemPropertyId === "string" && subItems.subItemPropertyId)
  ) {
    return null
  }

  await requireDataSourceEditAccess(dataSourceId, context.actorId)
  await context.transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sub-items:${dataSourceId}`}, 0))`)

  const [source] = await context.transaction.select({
    name: dataSource.name,
    parentDatabaseId: dataSource.parentDatabaseId,
    workspaceId: dataSource.workspaceId,
  }).from(dataSource).where(eq(dataSource.id, dataSourceId)).limit(1)
  if (!source) throw new Error("Data source not found")

  const columns = await context.transaction
    .select({ column: databaseProperty, property: pageProperty })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(and(
      eq(databaseProperty.dataSourceId, dataSourceId),
      isNull(pageProperty.deletedAt),
    ))
  const parent = columns.find(({ property }) => relationRole(property.config) === "parent-item")
  const child = columns.find(({ property }) => relationRole(property.config) === "sub-item")
  const parentPropertyId = parent?.property.id ?? crypto.randomUUID()
  const subItemPropertyId = child?.property.id ?? crypto.randomUUID()
  const parentColumnId = parent?.column.id ?? crypto.randomUUID()
  const childColumnId = child?.column.id ?? crypto.randomUUID()
  const parentName = parent?.property.name ?? "Parent item"
  const childName = child?.property.name ?? "Sub-item"
  const now = new Date()
  const relationBase = {
    relatedDatabaseId: source.parentDatabaseId,
    relatedDataSourceId: dataSourceId,
    relatedDatabaseName: source.name,
    relatedPageName: source.name,
    syncStatus: "synced",
    twoWayRelation: true,
  }
  const parentConfig = {
    relation: {
      ...relationBase,
      limit: "one_page",
      relatedPropertyId: subItemPropertyId,
      relatedPropertyName: childName,
    },
    subItems: { role: "parent-item" },
  }
  const childConfig = {
    relation: {
      ...relationBase,
      limit: "no_limit",
      relatedPropertyId: parentPropertyId,
      relatedPropertyName: parentName,
    },
    subItems: { role: "sub-item" },
  }

  if (parent) {
    await context.transaction.update(pageProperty).set({ config: parentConfig, updatedAt: now })
      .where(eq(pageProperty.id, parentPropertyId))
  } else {
    await context.transaction.insert(pageProperty).values({
      config: parentConfig,
      createdAt: now,
      id: parentPropertyId,
      name: parentName,
      type: "relation",
      updatedAt: now,
      workspaceId: source.workspaceId,
    })
    await context.transaction.insert(databaseProperty).values({
      createdAt: now,
      dataSourceId,
      id: parentColumnId,
      position: columns.length,
      propertyId: parentPropertyId,
      updatedAt: now,
    })
  }
  if (child) {
    await context.transaction.update(pageProperty).set({ config: childConfig, updatedAt: now })
      .where(eq(pageProperty.id, subItemPropertyId))
  } else {
    await context.transaction.insert(pageProperty).values({
      config: childConfig,
      createdAt: now,
      id: subItemPropertyId,
      name: childName,
      type: "relation",
      updatedAt: now,
      workspaceId: source.workspaceId,
    })
    await context.transaction.insert(databaseProperty).values({
      createdAt: now,
      dataSourceId,
      id: childColumnId,
      position: columns.length + (parent ? 0 : 1),
      propertyId: subItemPropertyId,
      updatedAt: now,
    })
  }

  const rows = await context.transaction.select({ pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(and(eq(databaseRow.dataSourceId, dataSourceId), isNull(databaseRow.deletedAt)))
  const validPageIds = new Set(rows.map(({ pageId }) => pageId))
  const storedValues = await context.transaction.select().from(pagePropertyValue)
    .where(inArray(pagePropertyValue.propertyId, [parentPropertyId, subItemPropertyId]))
  const parentsByChild = new Map<string, string>()
  const childrenByParent = new Map<string, string[]>()

  for (const value of storedValues) {
    if (!validPageIds.has(value.pageId)) continue
    const related = pageIds(value.value).filter((id) => validPageIds.has(id))
    if (value.propertyId === parentPropertyId) {
      if (related[0]) parentsByChild.set(value.pageId, related[0])
    } else {
      childrenByParent.set(value.pageId, related)
    }
  }
  for (const [parentPageId, childPageIds] of childrenByParent) {
    for (const childPageId of childPageIds) {
      if (!parentsByChild.has(childPageId)) parentsByChild.set(childPageId, parentPageId)
    }
  }
  childrenByParent.clear()
  for (const [childPageId, parentPageId] of parentsByChild) {
    const children = childrenByParent.get(parentPageId) ?? []
    children.push(childPageId)
    childrenByParent.set(parentPageId, children)
  }
  const values = [
    ...[...parentsByChild].map(([pageId, parentPageId]) => ({
      pageId, propertyId: parentPropertyId, value: parentPageId,
    })),
    ...[...childrenByParent].map(([pageId, childPageIds]) => ({
      pageId, propertyId: subItemPropertyId, value: childPageIds,
    })),
  ]
  if (values.length > 0) {
    await upsertPagePropertyValues(context.transaction, values.map((value) => ({
      ...value,
      createdAt: now,
      id: crypto.randomUUID(),
      updatedAt: now,
    })))
  }

  const properties = await Promise.all([
    getDatabasePropertyEntity(context, parentColumnId),
    getDatabasePropertyEntity(context, childColumnId),
  ])
  const affectedPageIds = [...new Set(values.map(({ pageId }) => pageId))]
  const affectedRows = affectedPageIds.length > 0
    ? await context.transaction.select({ id: databaseRow.id }).from(databaseRow)
      .where(and(
        eq(databaseRow.dataSourceId, dataSourceId),
        inArray(databaseRow.pageId, affectedPageIds),
      ))
    : []
  const records = []
  for (const row of affectedRows) {
    records.push(await getDatabaseRecordEntity(context.transaction, dataSourceId, row.id))
  }
  return {
    config: {
      ...(config as Record<string, unknown>),
      subItems: { ...subItems, parentPropertyId, subItemPropertyId },
    },
    properties,
    records,
  }
}
