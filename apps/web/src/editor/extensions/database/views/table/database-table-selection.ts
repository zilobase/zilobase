import type { DatabasePropertyValue } from "../../core/utils"

export const DATABASE_SELECTION_PRIMARY_PROPERTY_LIMIT = 5

export function splitDatabaseSelectionProperties<T>(
  properties: T[],
  limit = DATABASE_SELECTION_PRIMARY_PROPERTY_LIMIT
) {
  const primaryCount = Math.max(0, limit)

  return {
    overflow: properties.slice(primaryCount),
    primary: properties.slice(0, primaryCount),
  }
}

export function getSharedDatabaseSelectionValue(
  values: DatabasePropertyValue[],
  areEqual: (
    left: DatabasePropertyValue,
    right: DatabasePropertyValue
  ) => boolean
) {
  const firstValue = values[0] ?? ""
  const mixed = values.some((value) => !areEqual(firstValue, value))

  return {
    mixed,
    value: mixed ? "" : firstValue,
  }
}
