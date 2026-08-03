import { getDatabasePropertyCellKind } from "../core/database-property-types"
import type { DatabasePropertyValue } from "../core/utils"
import { areSerializedPropertyValuesEqual } from "./database-item-utils"

export type DatabaseCellFillHistoryChange = {
  nextValue: DatabasePropertyValue
  pageId: string
  previousValue: DatabasePropertyValue
  propertyId: string
  propertyType: string
  rowId: string
}

const fillableCellKinds = new Set([
  "checkbox",
  "date",
  "input",
  "person",
  "select",
])

export function isDatabasePropertyFillable(propertyType: string) {
  return fillableCellKinds.has(getDatabasePropertyCellKind(propertyType))
}

export function getDatabaseCellFillRowIds(
  rowIds: string[],
  sourceRowId: string,
  targetRowId: string
) {
  const sourceIndex = rowIds.indexOf(sourceRowId)
  const targetIndex = rowIds.indexOf(targetRowId)

  if (
    sourceIndex === -1 ||
    targetIndex === -1 ||
    sourceIndex === targetIndex
  ) {
    return []
  }

  const startIndex = Math.min(sourceIndex, targetIndex)
  const endIndex = Math.max(sourceIndex, targetIndex)

  return rowIds
    .slice(startIndex, endIndex + 1)
    .filter((rowId) => rowId !== sourceRowId)
}

export function getUndoableDatabaseCellFillChanges(
  changes: DatabaseCellFillHistoryChange[],
  propertyValuesByKey: Record<string, DatabasePropertyValue>
) {
  return changes.filter((change) => {
    const currentValue =
      propertyValuesByKey[`${change.pageId}:${change.propertyId}`] ?? ""

    return areSerializedPropertyValuesEqual(
      change.propertyType,
      currentValue,
      change.nextValue
    )
  })
}
