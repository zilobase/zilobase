import {
  firstScalarValue,
  serializePropertyValue,
  toStringArray,
  toTrimmedStringArray,
  type DatabasePropertyValue,
} from "../core/database-property-values"
import {
  evaluateDatabaseFilter,
  evaluateDatabaseFilters,
  type DatabasePredicateContext,
} from "@zilobase/features/databases/filter"
import { getReadOnlyTimePropertyRawValue } from "../properties/model/read-only-time-property"
import type {
  DatabaseFilterItemConfig,
  DatabaseSortConfig,
  DatabaseSortDirection,
} from "../views/model/database-view-config"

export type SortableDatabaseItem = {
  createdAt: string
  id: string
  page: {
    name: string
    createdAt?: string
    updatedAt?: string
  }
  pageId: string
  parentRowId?: string | null
  position: number
  updatedAt: string
}

type SortableDatabaseProperty = {
  id: string
  property: {
    id: string
    type: string
  }
}

export function hasViewHiddenPropertyIds(config: unknown) {
  return (
    config !== null &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    "hiddenPropertyIds" in config
  )
}

function isEmptySortValue(value: number | string | null) {
  return value === null || value === ""
}

function compareSortValues(
  firstValue: number | string | null,
  secondValue: number | string | null,
  direction: DatabaseSortDirection
) {
  const firstIsEmpty = isEmptySortValue(firstValue)
  const secondIsEmpty = isEmptySortValue(secondValue)

  if (firstIsEmpty || secondIsEmpty) {
    if (firstIsEmpty && secondIsEmpty) {
      return 0
    }

    return firstIsEmpty ? 1 : -1
  }

  let comparison = 0

  if (typeof firstValue === "number" && typeof secondValue === "number") {
    comparison = firstValue - secondValue
  } else {
    comparison = String(firstValue).localeCompare(String(secondValue), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  }

  return direction === "descending" ? comparison * -1 : comparison
}

function getComparableDateValue(
  value: DatabasePropertyValue | string | null | undefined
) {
  const rawValue = firstScalarValue(value)
  const timestamp = rawValue ? new Date(rawValue).getTime() : Number.NaN

  return Number.isFinite(timestamp) ? timestamp : null
}

function getComparableNumberValue(value: DatabasePropertyValue) {
  const rawValue = firstScalarValue(value).trim()
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN

  return Number.isFinite(parsedValue) ? parsedValue : null
}

function getComparablePersonValue(
  value: DatabasePropertyValue,
  personOptionsById: Map<string, string>
) {
  const personIds = toStringArray(value)

  return personIds
    .map((personId) => personOptionsById.get(personId) ?? personId)
    .join(", ")
}

function getComparablePropertyValue(
  item: SortableDatabaseItem,
  property: SortableDatabaseProperty,
  propertyValuesByKey: Record<string, DatabasePropertyValue>,
  personOptionsById: Map<string, string>
) {
  const propertyValue = propertyValuesByKey[`${item.pageId}:${property.property.id}`] ?? ""

  switch (property.property.type) {
    case "checkbox":
      return propertyValue === "true" ? 1 : 0
    case "created_time":
    case "edited_time":
      return getComparableDateValue(
        getReadOnlyTimePropertyRawValue(item, property.property.type)
      )
    case "date":
      return getComparableDateValue(propertyValue)
    case "number":
      return getComparableNumberValue(propertyValue)
    case "person":
      return getComparablePersonValue(propertyValue, personOptionsById)
    default:
      return Array.isArray(propertyValue) ? propertyValue.join(", ") : propertyValue
  }
}

function getFilterPropertyValue(
  item: SortableDatabaseItem,
  property: SortableDatabaseProperty,
  propertyValuesByKey: Record<string, DatabasePropertyValue>
) {
  if (property.property.type === "created_time" || property.property.type === "edited_time") {
    return getReadOnlyTimePropertyRawValue(item, property.property.type)
  }

  return propertyValuesByKey[`${item.pageId}:${property.property.id}`] ?? ""
}

function createDatabasePredicateContext({
  item,
  personOptionsById,
  properties,
  propertyValuesByKey,
}: {
  item: SortableDatabaseItem
  personOptionsById: Map<string, string>
  properties: SortableDatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
}): DatabasePredicateContext {
  const getProperty = (propertyId: string) =>
    properties.find((property) => property.id === propertyId)

  return {
    getPropertyType(propertyId) {
      return propertyId === "name"
        ? "text"
        : (getProperty(propertyId)?.property.type ?? "text")
    },
    getPropertyValues(propertyId) {
      if (propertyId === "name") {
        return item.page.name.trim() ? [item.page.name.trim()] : []
      }

      const property = getProperty(propertyId)
      if (!property) return []

      const value = getFilterPropertyValue(item, property, propertyValuesByKey)
      if (property.property.type === "checkbox") {
        return [value === "true" ? "Checked" : "Unchecked"]
      }
      if (property.property.type === "person") {
        return toStringArray(value).map(
          (personId) => personOptionsById.get(personId) ?? personId
        )
      }

      return toTrimmedStringArray(value)
    },
  }
}

export function databaseItemMatchesFilter({
  filter,
  item,
  personOptionsById,
  properties,
  propertyValuesByKey,
}: {
  filter: DatabaseFilterItemConfig
  item: SortableDatabaseItem
  personOptionsById: Map<string, string>
  properties: SortableDatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
}) {
  return evaluateDatabaseFilter(
    filter,
    createDatabasePredicateContext({
      item,
      personOptionsById,
      properties,
      propertyValuesByKey,
    })
  )
}

export function getFilteredDatabaseItems(
  items: SortableDatabaseItem[],
  properties: SortableDatabaseProperty[],
  propertyValuesByKey: Record<string, DatabasePropertyValue>,
  filters: DatabaseFilterItemConfig[],
  personOptionsById: Map<string, string>
) {
  if (filters.length === 0) {
    return items
  }

  return items.filter((item) =>
    evaluateDatabaseFilters(
      filters,
      createDatabasePredicateContext({
        item,
        personOptionsById,
        properties,
        propertyValuesByKey,
      })
    )
  )
}

export function getSortedDatabaseItems(
  items: SortableDatabaseItem[],
  properties: SortableDatabaseProperty[],
  propertyValuesByKey: Record<string, DatabasePropertyValue>,
  sorts: DatabaseSortConfig[],
  personOptionsById: Map<string, string>
) {
  if (sorts.length === 0) {
    return items
  }

  return [...items].sort((firstItem, secondItem) => {
    for (const sort of sorts) {
      const comparison =
        sort.column === "name"
          ? compareSortValues(
              firstItem.page.name.trim(),
              secondItem.page.name.trim(),
              sort.direction
            )
          : (() => {
              const sortedProperty = properties.find(
                (property) => property.id === sort.column
              )

              if (!sortedProperty) {
                return 0
              }

              return compareSortValues(
                getComparablePropertyValue(
                  firstItem,
                  sortedProperty,
                  propertyValuesByKey,
                  personOptionsById
                ),
                getComparablePropertyValue(
                  secondItem,
                  sortedProperty,
                  propertyValuesByKey,
                  personOptionsById
                ),
                sort.direction
              )
            })()

      if (comparison !== 0) {
        return comparison
      }
    }

    return firstItem.position - secondItem.position
  })
}

export function areSerializedPropertyValuesEqual(
  propertyType: string,
  currentValue: DatabasePropertyValue,
  nextValue: DatabasePropertyValue
) {
  return (
    JSON.stringify(serializePropertyValue(propertyType, currentValue)) ===
    JSON.stringify(serializePropertyValue(propertyType, nextValue))
  )
}
