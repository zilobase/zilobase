import {
  databaseAddPropertyColumnDefaultWidth,
  databaseColumnDefaultWidth,
  databaseNameColumnDefaultWidth,
} from "../../../core/database-contracts"
import type { SortableDatabaseItem } from "../../../interactions/database-item-utils"
import type { DatabaseRowDropTarget } from "../../../interactions/database-table-layout"
import type { DatabaseTableGroupSection } from "../../../interactions/database-table-group-sections"

export type InsertPropertySide = "left" | "right"

export type PendingInsertProperty = {
  position: number
  side: InsertPropertySide
  sourceColumnKey: string
}

export type PendingPropertyInsertOrder = {
  columnIds: string[]
  existingPropertyIds: string[]
  side: InsertPropertySide
  sourceColumnKey: string
}

export type PendingFormulaSetup = {
  existingPropertyIds: string[]
}

export type PendingSortedRowReorder = {
  groupPropertyId?: string
  groupValue?: unknown
  rowId: string
  rowIds: string[]
  subItemParentRowId?: string | null
}

export type RowMove = PendingSortedRowReorder
export type TableRow = SortableDatabaseItem
export type GroupSection = DatabaseTableGroupSection<TableRow>

export type RowLayout = {
  centers: Record<string, number>
  dropTops: number[]
  heights: Record<string, number>
}

export type TableRowDropTarget = DatabaseRowDropTarget & {
  subItemParentRowId?: string | null
}

export type GroupRowDropTarget = {
  localTargetIndex: number
  sectionId: string
  top: number
}

export type CellFillDrag = {
  propertyId: string
  propertyType: string
  sourceRowId: string
  sourceValue: string | string[]
  targetRowId: string
}

export const DATABASE_NAME_COLUMN_ID = "name"
export const ADD_PROPERTY_COLUMN_ID = "add-property"
const INSERT_PROPERTY_COLUMN_PREFIX = "insert-property"
export const DATABASE_SUB_ITEM_DRAG_INDENT = 20

export function getHeaderEditingKey(headerScope: string, propertyKey: string) {
  return `${headerScope}:${propertyKey}`
}

export function getPropertyKeyFromHeaderEditingKey(editingKey: string | null) {
  if (!editingKey) return null
  const separatorIndex = editingKey.indexOf(":")
  return separatorIndex === -1 ? editingKey : editingKey.slice(separatorIndex + 1)
}

export function areColumnOrdersEqual(left: string[] | null, right: string[]) {
  return left !== null && left.length === right.length &&
    left.every((propertyId, index) => propertyId === right[index])
}

export function getMergedColumnIds(
  columnIds: string[],
  preferredColumnIds: string[] | null
) {
  if (!preferredColumnIds) return columnIds

  const validColumnIds = new Set(columnIds)
  const seenColumnIds = new Set<string>()
  const orderedColumnIds = preferredColumnIds.filter((columnId) => {
    if (!validColumnIds.has(columnId) || seenColumnIds.has(columnId)) return false
    seenColumnIds.add(columnId)
    return true
  })

  return [
    ...orderedColumnIds,
    ...columnIds.filter((columnId) => !seenColumnIds.has(columnId)),
  ]
}

export function getColumnIdsWithInsertedProperty(
  pendingInsert: PendingPropertyInsertOrder,
  propertyId: string,
  currentColumnIds: string[]
) {
  const columnIds = pendingInsert.columnIds.filter(
    (columnId) => columnId !== propertyId
  )
  const sourceIndex = columnIds.indexOf(pendingInsert.sourceColumnKey)
  const insertIndex = sourceIndex === -1
    ? columnIds.length
    : sourceIndex + (pendingInsert.side === "right" ? 1 : 0)

  columnIds.splice(insertIndex, 0, propertyId)
  return getMergedColumnIds(currentColumnIds, columnIds)
}

export function requireDatabaseId(databaseId: string | null | undefined) {
  if (!databaseId) throw new Error("DatabaseTableView requires a Database id.")
  return databaseId
}

export function getColumnWidth(columnWidths: Record<string, number>, key: string) {
  return columnWidths[key] ??
    (key === DATABASE_NAME_COLUMN_ID
      ? databaseNameColumnDefaultWidth
      : key === ADD_PROPERTY_COLUMN_ID ||
          key.startsWith(`${INSERT_PROPERTY_COLUMN_PREFIX}-`)
        ? databaseAddPropertyColumnDefaultWidth
        : databaseColumnDefaultWidth)
}

export function getInsertPropertyColumnKey(
  sourceColumnKey: string,
  side: InsertPropertySide
) {
  return `${INSERT_PROPERTY_COLUMN_PREFIX}-${sourceColumnKey}-${side}`
}

export function getRowTitle(row: TableRow) {
  return row.page.name.trim() || "Untitled"
}

export function getRowDragTitle({
  canReorder,
  isFiltered,
  isGrouped,
  isSorted,
}: {
  canReorder: boolean
  isFiltered: boolean
  isGrouped: boolean
  isSorted: boolean
}) {
  if (!canReorder) return "Manual row sorting is disabled"
  if (isGrouped && isSorted) return "Drag within this group. Clear sorting to save the new order."
  if (isGrouped) return "Drag within this group"
  if (isSorted && isFiltered) return "Drag page. Clear sorting to save the new order; hidden rows keep their relative order."
  if (isSorted) return "Drag page. Clear sorting to save the new order."
  if (isFiltered) return "Drag page. Hidden rows keep their relative order."
  return "Drag page"
}
