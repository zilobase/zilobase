import {
  serializePropertyValue,
  toStringArray,
  type DatabasePropertyValue,
} from "../utils"
import type {
  DatabaseFilterItemConfig,
  DatabasePropertyFilterConfig,
  DatabaseSortConfig,
  DatabaseSortDirection,
} from "./database-view-config"
import {
  isDatabaseFilterGroup,
  type DatabasePropertyFilterOperator,
} from "./database-view-config"

export type SortableDatabaseItem = {
  createdAt: string
  id: string
  page: {
    name: string
    createdAt?: string
    updatedAt?: string
  }
  pageId: string
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

function getReadOnlyTimePropertySortValue(
  item: {
    createdAt: string
    page: {
      createdAt?: string
      updatedAt?: string
    }
    updatedAt: string
  },
  type: string
) {
  return type === "created_time"
    ? item.page.createdAt ?? item.createdAt
    : item.page.updatedAt ?? item.updatedAt
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
  const rawValue = Array.isArray(value) ? value[0] ?? "" : value
  const timestamp = rawValue ? new Date(rawValue).getTime() : Number.NaN

  return Number.isFinite(timestamp) ? timestamp : null
}

function getComparableNumberValue(value: DatabasePropertyValue) {
  const rawValue = Array.isArray(value) ? value[0] ?? "" : value
  const parsedValue = rawValue.trim() ? Number(rawValue) : Number.NaN

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
        getReadOnlyTimePropertySortValue(item, property.property.type)
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

function getDateValue(value: DatabasePropertyValue | string | null | undefined) {
  const rawValue = Array.isArray(value) ? value[0] ?? "" : value
  const timestamp = rawValue ? new Date(rawValue).getTime() : Number.NaN

  if (!Number.isFinite(timestamp)) {
    return null
  }

  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)

  return date
}

function getReadOnlyTimePropertyFilterValue(
  item: SortableDatabaseItem,
  type: string
) {
  return type === "created_time"
    ? item.page.createdAt ?? item.createdAt
    : item.page.updatedAt ?? item.updatedAt
}

function getFilterPropertyValue(
  item: SortableDatabaseItem,
  property: SortableDatabaseProperty,
  propertyValuesByKey: Record<string, DatabasePropertyValue>
) {
  if (property.property.type === "created_time" || property.property.type === "edited_time") {
    return getReadOnlyTimePropertyFilterValue(item, property.property.type)
  }

  return propertyValuesByKey[`${item.pageId}:${property.property.id}`] ?? ""
}

function getFilterRowValues({
  filter,
  item,
  personOptionsById,
  properties,
  propertyValuesByKey,
}: {
  filter: DatabasePropertyFilterConfig
  item: SortableDatabaseItem
  personOptionsById: Map<string, string>
  properties: SortableDatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
}) {
  if (filter.propertyId === "name") {
    return item.page.name.trim() ? [item.page.name.trim()] : []
  }

  const property = properties.find(
    (databaseProperty) => databaseProperty.id === filter.propertyId
  )

  if (!property) {
    return []
  }

  const value = getFilterPropertyValue(item, property, propertyValuesByKey)

  if (property.property.type === "checkbox") {
    return [value === "true" ? "Checked" : "Unchecked"]
  }

  if (property.property.type === "person") {
    return toStringArray(value).map(
      (personId) => personOptionsById.get(personId) ?? personId
    )
  }

  return Array.isArray(value) ? value : value.trim() ? [value] : []
}

function getFilterPropertyType(
  filter: DatabasePropertyFilterConfig,
  properties: SortableDatabaseProperty[]
) {
  if (filter.propertyId === "name") {
    return "text"
  }

  return (
    properties.find((property) => property.id === filter.propertyId)?.property.type ??
    "text"
  )
}

function getNumberFilterValue(value: string | undefined) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : null
}

function compareNumberFilter(
  rowValue: number | null,
  filterValue: number | null,
  operator: DatabasePropertyFilterOperator
) {
  if (rowValue === null || filterValue === null) {
    return operator === "is_not"
  }

  if (operator === "is_not") {
    return rowValue !== filterValue
  }

  if (operator === "greater_than") {
    return rowValue > filterValue
  }

  if (operator === "less_than") {
    return rowValue < filterValue
  }

  if (operator === "greater_than_or_equal") {
    return rowValue >= filterValue
  }

  if (operator === "less_than_or_equal") {
    return rowValue <= filterValue
  }

  return rowValue === filterValue
}

function getRelativeDateRange(value: string | undefined) {
  const [, direction = "this", unit = "week"] = (value ?? "relative:this:week")
    .split(":")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  const end = new Date(today)

  if (unit === "day") {
    if (direction === "past") {
      start.setDate(today.getDate() - 1)
      end.setDate(today.getDate() - 1)
    } else if (direction === "next") {
      start.setDate(today.getDate() + 1)
      end.setDate(today.getDate() + 1)
    }

    return { end, start }
  }

  if (unit === "week") {
    const day = today.getDay()
    start.setDate(today.getDate() - day)
    end.setDate(start.getDate() + 6)
  } else if (unit === "month") {
    start.setDate(1)
    end.setMonth(start.getMonth() + 1, 0)
  } else {
    start.setMonth(0, 1)
    end.setMonth(11, 31)
  }

  if (direction === "past") {
    if (unit === "week") {
      start.setDate(start.getDate() - 7)
      end.setDate(end.getDate() - 7)
    } else if (unit === "month") {
      start.setMonth(start.getMonth() - 1)
      end.setMonth(end.getMonth() - 1)
    } else {
      start.setFullYear(start.getFullYear() - 1)
      end.setFullYear(end.getFullYear() - 1)
    }
  } else if (direction === "next") {
    if (unit === "week") {
      start.setDate(start.getDate() + 7)
      end.setDate(end.getDate() + 7)
    } else if (unit === "month") {
      start.setMonth(start.getMonth() + 1)
      end.setMonth(end.getMonth() + 1)
    } else {
      start.setFullYear(start.getFullYear() + 1)
      end.setFullYear(end.getFullYear() + 1)
    }
  }

  return { end, start }
}

function compareDateFilter(
  rowDate: Date | null,
  filter: DatabasePropertyFilterConfig
) {
  if (!rowDate) {
    return filter.operator === "is_not"
  }

  if (filter.operator === "is_relative_to_today") {
    const range = getRelativeDateRange(filter.values[0])

    return rowDate >= range.start && rowDate <= range.end
  }

  const filterDate = getDateValue(filter.values[0])

  if (!filterDate) {
    return true
  }

  if (filter.operator === "is_before") {
    return rowDate < filterDate
  }

  if (filter.operator === "is_after") {
    return rowDate > filterDate
  }

  if (filter.operator === "is_on_or_before") {
    return rowDate <= filterDate
  }

  if (filter.operator === "is_on_or_after") {
    return rowDate >= filterDate
  }

  if (filter.operator === "is_between") {
    const secondFilterDate = getDateValue(filter.values[1])

    if (!secondFilterDate) {
      return rowDate >= filterDate
    }

    const startDate = filterDate <= secondFilterDate ? filterDate : secondFilterDate
    const endDate = filterDate <= secondFilterDate ? secondFilterDate : filterDate

    return rowDate >= startDate && rowDate <= endDate
  }

  if (filter.operator === "is_not") {
    return rowDate.getTime() !== filterDate.getTime()
  }

  return rowDate.getTime() === filterDate.getTime()
}

function itemMatchesPropertyFilter({
  filter,
  item,
  personOptionsById,
  properties,
  propertyValuesByKey,
}: {
  filter: DatabasePropertyFilterConfig
  item: SortableDatabaseItem
  personOptionsById: Map<string, string>
  properties: SortableDatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
}) {
  const propertyType = getFilterPropertyType(filter, properties)
  const rowValues = getFilterRowValues({
    filter,
    item,
    personOptionsById,
    properties,
    propertyValuesByKey,
  })
  const normalizedRowValues = rowValues.map((value) => value.trim().toLowerCase())
  const normalizedFilterValues = filter.values.map((value) =>
    value.trim().toLowerCase()
  )
  const hasRowValue = normalizedRowValues.some(Boolean)

  if (filter.operator === "is_empty") {
    return !hasRowValue
  }

  if (filter.operator === "is_not_empty") {
    return hasRowValue
  }

  if (filter.values.length === 0) {
    return true
  }

  if (propertyType === "date" || propertyType === "created_time" || propertyType === "edited_time") {
    return compareDateFilter(getDateValue(rowValues[0]), filter)
  }

  if (propertyType === "number") {
    return compareNumberFilter(
      getNumberFilterValue(rowValues[0]),
      getNumberFilterValue(filter.values[0]),
      filter.operator
    )
  }

  if (filter.operator === "is_not") {
    return !normalizedFilterValues.some((value) =>
      normalizedRowValues.includes(value)
    )
  }

  if (filter.operator === "contains") {
    return normalizedFilterValues.some((value) =>
      normalizedRowValues.some((rowValue) => rowValue.includes(value))
    )
  }

  if (filter.operator === "does_not_contain") {
    return !normalizedFilterValues.some((value) =>
      normalizedRowValues.some((rowValue) => rowValue.includes(value))
    )
  }

  if (filter.operator === "starts_with") {
    return normalizedFilterValues.some((value) =>
      normalizedRowValues.some((rowValue) => rowValue.startsWith(value))
    )
  }

  if (filter.operator === "ends_with") {
    return normalizedFilterValues.some((value) =>
      normalizedRowValues.some((rowValue) => rowValue.endsWith(value))
    )
  }

  return normalizedFilterValues.some((value) =>
    normalizedRowValues.includes(value)
  )
}

function itemMatchesFilter({
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
}): boolean {
  if (!isDatabaseFilterGroup(filter)) {
    return itemMatchesPropertyFilter({
      filter,
      item,
      personOptionsById,
      properties,
      propertyValuesByKey,
    })
  }

  return itemMatchesFilters({
    filters: filter.filters,
    item,
    operator: filter.operator,
    personOptionsById,
    properties,
    propertyValuesByKey,
  })
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
  return itemMatchesFilter({
    filter,
    item,
    personOptionsById,
    properties,
    propertyValuesByKey,
  })
}

function itemMatchesFilters({
  filters,
  item,
  operator = "and",
  personOptionsById,
  properties,
  propertyValuesByKey,
}: {
  filters: DatabaseFilterItemConfig[]
  item: SortableDatabaseItem
  operator?: "and" | "or"
  personOptionsById: Map<string, string>
  properties: SortableDatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
}) {
  if (filters.length === 0) {
    return true
  }

  const [firstFilter, ...remainingFilters] = filters
  let matches = itemMatchesFilter({
    filter: firstFilter,
    item,
    personOptionsById,
    properties,
    propertyValuesByKey,
  })

  for (const filter of remainingFilters) {
    const filterMatches = itemMatchesFilter({
      filter,
      item,
      personOptionsById,
      properties,
      propertyValuesByKey,
    })

    matches =
      (filter.joinOperator ?? operator) === "or"
        ? matches || filterMatches
        : matches && filterMatches
  }

  return matches
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
    itemMatchesFilters({
      filters,
      item,
      personOptionsById,
      properties,
      propertyValuesByKey,
    })
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
