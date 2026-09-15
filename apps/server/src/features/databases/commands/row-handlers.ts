import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import type {
  DataSourceCommand,
  DatabaseRecordEntity,
} from "@zilobase/features/databases/contracts"
import {
  databaseOrderKeyAtPosition,
  databaseOrderKeyBetween,
  parseDatabaseOrderKey,
} from "@zilobase/features/databases/order-key"

import { encodePageContentAsYjs } from "../../collaboration/service"
import { upsertPageItemPlacement } from "../../pages/placements"
import {
  dataSource,
  databaseDataSource,
  databaseProperty,
  databaseRow,
  page,
  pageCollaborationDocument,
  pageItemPlacement,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"
import {
  lockDatabaseRowOrdering,
  rebalanceDatabaseRowOrderKeys,
  updateDatabaseRowPlacementPositions,
} from "../core/position-service"
import { validateCellValue } from "../properties/config"
import {
  type DatabaseCommandContext,
  type DatabaseCommandDispatchResult,
  type DatabaseCommandMutation,
  RowMoveConflictError,
} from "./framework"
import { getDatabaseRecordEntity } from "./record-entity"

type OrderedRow = {
  id: string
  orderKey: string
  pageId: string
}

function sortRows(rows: OrderedRow[]) {
  return [...rows].sort((left, right) => {
    const leftKey = parseDatabaseOrderKey(left.orderKey)
    const rightKey = parseDatabaseOrderKey(right.orderKey)
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : left.id.localeCompare(right.id)
  })
}

export function resolveAnchoredRowIndex(input: {
  afterRowId: string | null
  beforeRowId: string | null
  rowId: string
  rows: Array<{ id: string }>
}) {
  const rows = input.rows.filter(({ id }) => id !== input.rowId)
  const beforeIndex = input.beforeRowId
    ? rows.findIndex(({ id }) => id === input.beforeRowId)
    : -1
  const afterIndex = input.afterRowId
    ? rows.findIndex(({ id }) => id === input.afterRowId)
    : -1
  const beforeValid = beforeIndex >= 0
  const afterValid = afterIndex >= 0

  if (input.beforeRowId && input.afterRowId && beforeValid && afterValid) {
    if (afterIndex >= beforeIndex) throw new RowMoveConflictError(input.rowId)
    return { index: afterIndex + 1, rows }
  }
  if (beforeValid) return { index: beforeIndex, rows }
  if (afterValid) return { index: afterIndex + 1, rows }
  if (input.beforeRowId || input.afterRowId) {
    throw new RowMoveConflictError(input.rowId)
  }
  return { index: rows.length, rows }
}

async function sourceRecord(context: DatabaseCommandContext) {
  if (!context.dataSourceId) throw new Error("A data-source command requires a source scope")
  const [source] = await context.transaction
    .select()
    .from(dataSource)
    .where(eq(dataSource.id, context.dataSourceId))
    .limit(1)
  if (!source) throw new ServiceMutationError("Data source not found", 404)
  return source
}

async function activeRows(context: DatabaseCommandContext, dataSourceId: string) {
  return sortRows(await context.transaction
    .select({
      id: databaseRow.id,
      orderKey: databaseRow.orderKey,
      pageId: databaseRow.pageId,
    })
    .from(databaseRow)
    .where(and(
      eq(databaseRow.dataSourceId, dataSourceId),
      isNull(databaseRow.deletedAt),
    )))
}

async function allocateOrderKey(
  context: DatabaseCommandContext,
  dataSourceId: string,
  rows: OrderedRow[],
  index: number,
  now: Date,
) {
  const previous = rows[index - 1]
  const next = rows[index]
  const before = previous
    ? previous.orderKey
    : null
  const after = next
    ? next.orderKey
    : null
  let orderKey = databaseOrderKeyBetween(before, after)
  if (orderKey !== null) return orderKey

  await rebalanceDatabaseRowOrderKeys(
    context.transaction,
    dataSourceId,
    rows.map(({ id }) => id),
    now,
  )
  orderKey = databaseOrderKeyBetween(
    index === 0 ? null : databaseOrderKeyAtPosition(index - 1),
    index === rows.length ? null : databaseOrderKeyAtPosition(index),
  )
  if (orderKey === null) throw new Error("Row order key allocation failed after rebalance")
  return orderKey
}

async function mutationForHosts(
  context: DatabaseCommandContext,
  record: DatabaseRecordEntity,
  changes: { records?: DatabaseRecordEntity[]; removedRecordIds?: string[] },
): Promise<DatabaseCommandMutation[]> {
  const hosts = await context.transaction
    .select({ databaseId: databaseDataSource.databaseId })
    .from(databaseDataSource)
    .where(eq(databaseDataSource.dataSourceId, record.dataSourceId))
  return hosts.map(({ databaseId }) => ({
    areas: ["records"],
    changes,
    databaseId,
    dataSourceId: record.dataSourceId,
  }))
}

async function validateParent(
  context: DatabaseCommandContext,
  dataSourceId: string,
  parentRowId: string | null,
) {
  if (!parentRowId) return
  const [parent] = await context.transaction
    .select({ id: databaseRow.id })
    .from(databaseRow)
    .where(and(
      eq(databaseRow.id, parentRowId),
      eq(databaseRow.dataSourceId, dataSourceId),
      isNull(databaseRow.deletedAt),
    ))
    .limit(1)
  if (!parent) throw new ServiceMutationError("Parent row not found", 404)
}

async function propertiesForValues(
  context: DatabaseCommandContext,
  source: typeof dataSource.$inferSelect,
  values: Record<string, unknown>,
) {
  const propertyIds = Object.keys(values)
  if (propertyIds.length === 0) return []
  const properties = await context.transaction
    .select({
      config: pageProperty.config,
      id: pageProperty.id,
      type: pageProperty.type,
    })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(and(
      eq(databaseProperty.dataSourceId, source.id),
      eq(pageProperty.workspaceId, source.workspaceId),
      inArray(pageProperty.id, propertyIds),
      isNull(pageProperty.deletedAt),
    ))
  if (properties.length !== propertyIds.length) {
    throw new ServiceMutationError("Property not found", 404)
  }
  for (const property of properties) {
    validateCellValue(property.type, property.config, values[property.id])
  }
  return properties
}

async function writeValues(
  context: DatabaseCommandContext,
  pageId: string,
  values: Record<string, unknown>,
  now: Date,
) {
  const rows = Object.entries(values).map(([propertyId, value]) => ({
    createdAt: now,
    id: crypto.randomUUID(),
    pageId,
    propertyId,
    updatedAt: now,
    value,
  }))
  if (!rows.length) return
  await context.transaction.insert(pagePropertyValue).values(rows).onConflictDoUpdate({
    set: { updatedAt: now, value: sql`excluded.value` },
    target: [pagePropertyValue.pageId, pagePropertyValue.propertyId],
  })
}

async function createRow(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "row.create" }>,
): Promise<DatabaseCommandDispatchResult<DatabaseRecordEntity>> {
  const source = await sourceRecord(context)
  await lockDatabaseRowOrdering(context.transaction, source.id)
  const rows = await activeRows(context, source.id)
  const placement = resolveAnchoredRowIndex({
    afterRowId: command.afterRowId,
    beforeRowId: command.beforeRowId,
    rowId: "",
    rows,
  })
  await validateParent(context, source.id, command.parentRowId)
  const values = command.valuesByPropertyId ?? {}
  await propertiesForValues(context, source, values)

  const now = new Date()
  const orderKey = await allocateOrderKey(
    context,
    source.id,
    placement.rows as OrderedRow[],
    placement.index,
    now,
  )
  const rowId = crypto.randomUUID()
  const pageId = command.pageId ?? crypto.randomUUID()
  const [existingPage] = command.pageId
    ? await context.transaction
        .select({ id: page.id, workspaceId: page.workspaceId })
        .from(page)
        .where(and(
          eq(page.id, command.pageId),
          eq(page.workspaceId, source.workspaceId),
          isNull(page.deletedAt),
        ))
        .limit(1)
    : []
  if (command.pageId && !existingPage) throw new ServiceMutationError("Page not found", 404)

  if (existingPage) {
    await context.transaction.update(page).set({ name: command.title, updatedAt: now })
      .where(eq(page.id, pageId))
  } else {
    await context.transaction.insert(page).values({
      content: null,
      createdAt: now,
      createdById: context.actorId,
      hasContent: false,
      id: pageId,
      metadata: null,
      name: command.title,
      type: "pageblock",
      updatedAt: now,
      url: "#",
      workspaceId: source.workspaceId,
    })
    await context.transaction.insert(pageCollaborationDocument).values({
      pageId,
      state: Buffer.from(encodePageContentAsYjs(null)),
      updatedAt: now,
    })
  }

  await context.transaction.insert(databaseRow).values({
    createdAt: now,
    createdById: context.actorId,
    dataSourceId: source.id,
    id: rowId,
    lastEditedById: context.actorId,
    orderKey,
    pageId,
    parentRowId: command.parentRowId,
    updatedAt: now,
  })
  await writeValues(context, pageId, values, now)

  const rowIds = [...placement.rows.map(({ id }) => id)]
  rowIds.splice(placement.index, 0, rowId)
  await updateDatabaseRowPlacementPositions(
    context.transaction,
    source.parentDatabaseId,
    rowIds,
    now,
  )
  await upsertPageItemPlacement(context.transaction, {
    itemId: pageId,
    itemKind: "page",
    parentId: source.parentDatabaseId,
    parentKind: "database",
    placementKind: "database_row",
    position: placement.index,
    sourceRowId: rowId,
    workspaceId: source.workspaceId,
  })

  const record = await getDatabaseRecordEntity(context.transaction, source.id, rowId)
  return {
    mutations: await mutationForHosts(context, record, { records: [record] }),
    result: record,
  }
}

async function moveRow(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "row.move" }>,
): Promise<DatabaseCommandDispatchResult<DatabaseRecordEntity>> {
  const source = await sourceRecord(context)
  await lockDatabaseRowOrdering(context.transaction, source.id)
  const rows = await activeRows(context, source.id)
  const row = rows.find(({ id }) => id === command.rowId)
  if (!row) throw new RowMoveConflictError(command.rowId)
  const placement = resolveAnchoredRowIndex({ ...command, rows })
  const now = new Date()
  const orderKey = await allocateOrderKey(
    context,
    source.id,
    placement.rows as OrderedRow[],
    placement.index,
    now,
  )

  if (command.group) {
    const values = { [command.group.propertyId]: command.group.value }
    await propertiesForValues(context, source, values)
    await writeValues(context, row.pageId, values, now)
    await context.transaction.update(page).set({ updatedAt: now })
      .where(eq(page.id, row.pageId))
  }
  await context.transaction.update(databaseRow).set({
    ...(command.group ? { lastEditedById: context.actorId } : {}),
    orderKey,
    updatedAt: now,
  }).where(and(
    eq(databaseRow.id, row.id),
    eq(databaseRow.dataSourceId, source.id),
    isNull(databaseRow.deletedAt),
  ))

  const rowIds = placement.rows.map(({ id }) => id)
  rowIds.splice(placement.index, 0, row.id)
  await updateDatabaseRowPlacementPositions(
    context.transaction,
    source.parentDatabaseId,
    rowIds,
    now,
  )
  const record = await getDatabaseRecordEntity(context.transaction, source.id, row.id)
  return {
    mutations: await mutationForHosts(context, record, { records: [record] }),
    result: record,
  }
}

async function setCell(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "cell.set" }>,
): Promise<DatabaseCommandDispatchResult<DatabaseRecordEntity>> {
  const source = await sourceRecord(context)
  const [row] = await context.transaction
    .select({ id: databaseRow.id, pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(and(
      eq(databaseRow.id, command.rowId),
      eq(databaseRow.dataSourceId, source.id),
      isNull(databaseRow.deletedAt),
    ))
    .limit(1)
  if (!row) throw new ServiceMutationError("Row not found", 404)
  await propertiesForValues(context, source, { [command.propertyId]: command.value })
  const now = new Date()
  await writeValues(context, row.pageId, { [command.propertyId]: command.value }, now)
  await context.transaction.update(databaseRow).set({
    lastEditedById: context.actorId,
    updatedAt: now,
  }).where(eq(databaseRow.id, row.id))
  await context.transaction.update(page).set({ updatedAt: now }).where(eq(page.id, row.pageId))
  const record = await getDatabaseRecordEntity(context.transaction, source.id, row.id)
  return {
    mutations: await mutationForHosts(context, record, { records: [record] }),
    result: record,
  }
}

async function setRowArchived(
  context: DatabaseCommandContext,
  command: Extract<DataSourceCommand, { type: "row.archive" | "row.restore" }>,
): Promise<DatabaseCommandDispatchResult<DatabaseRecordEntity>> {
  const source = await sourceRecord(context)
  await lockDatabaseRowOrdering(context.transaction, source.id)
  const restore = command.type === "row.restore"
  const [row] = await context.transaction
    .select({ id: databaseRow.id, orderKey: databaseRow.orderKey, pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(and(
      eq(databaseRow.id, command.rowId),
      eq(databaseRow.dataSourceId, source.id),
      restore ? isNotNull(databaseRow.deletedAt) : isNull(databaseRow.deletedAt),
    ))
    .limit(1)
  if (!row) throw new ServiceMutationError("Row not found", 404)
  const active = await activeRows(context, source.id)
  const now = new Date()

  if (restore) {
    const withoutRow = active.filter(({ id }) => id !== row.id)
    const orderKey = await allocateOrderKey(
      context,
      source.id,
      withoutRow,
      withoutRow.length,
      now,
    )
    await context.transaction.update(databaseRow).set({
      deletedAt: null,
      deletedById: null,
      lastEditedById: context.actorId,
      orderKey,
      updatedAt: now,
    }).where(and(eq(databaseRow.id, row.id), eq(databaseRow.dataSourceId, source.id)))
    const rowIds = [...withoutRow.map(({ id }) => id), row.id]
    await context.transaction.update(pageItemPlacement).set({
      deletedAt: null,
      position: rowIds.length - 1,
      updatedAt: now,
    }).where(eq(pageItemPlacement.sourceRowId, row.id))
    await upsertPageItemPlacement(context.transaction, {
      itemId: row.pageId,
      itemKind: "page",
      parentId: source.parentDatabaseId,
      parentKind: "database",
      placementKind: "database_row",
      position: rowIds.length - 1,
      sourceRowId: row.id,
      workspaceId: source.workspaceId,
    })
  } else {
    await context.transaction.update(databaseRow).set({
      deletedAt: now,
      deletedById: context.actorId,
      lastEditedById: context.actorId,
      updatedAt: now,
    }).where(and(eq(databaseRow.id, row.id), eq(databaseRow.dataSourceId, source.id)))
    await context.transaction.update(pageItemPlacement).set({
      deletedAt: now,
      updatedAt: now,
    }).where(eq(pageItemPlacement.sourceRowId, row.id))
    const rowIds = active.filter(({ id }) => id !== row.id).map(({ id }) => id)
    await updateDatabaseRowPlacementPositions(
      context.transaction,
      source.parentDatabaseId,
      rowIds,
      now,
    )
  }

  const record = await getDatabaseRecordEntity(context.transaction, source.id, row.id)
  return {
    mutations: await mutationForHosts(
      context,
      record,
      restore ? { records: [record] } : { removedRecordIds: [record.id] },
    ),
    result: record,
  }
}

export async function dispatchRowOrCellCommand(
  context: DatabaseCommandContext,
  command: DataSourceCommand,
) {
  switch (command.type) {
    case "row.create": return createRow(context, command)
    case "row.move": return moveRow(context, command)
    case "row.archive":
    case "row.restore": return setRowArchived(context, command)
    case "cell.set": return setCell(context, command)
    default: return null
  }
}
