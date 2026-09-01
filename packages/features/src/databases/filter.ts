import {
  getRuntimeTimezone,
  getZonedDateParts,
  startOfDayInTimezone,
  zonedDatePartsToDate,
} from "./formula/time"

export type DatabaseFilterGroupOperator = "and" | "or"

export type DatabasePropertyFilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "does_not_contain"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "is_before"
  | "is_after"
  | "is_on_or_before"
  | "is_on_or_after"
  | "is_between"
  | "is_relative_to_today"
  | "is_empty"
  | "is_not_empty"

export type DatabasePropertyFilterConfig = {
  id: string
  joinOperator?: DatabaseFilterGroupOperator
  operator: DatabasePropertyFilterOperator
  propertyId: "name" | string
  values: string[]
}

export type DatabaseFilterGroupConfig = {
  filters: DatabaseFilterItemConfig[]
  id: string
  joinOperator?: DatabaseFilterGroupOperator
  operator: DatabaseFilterGroupOperator
  type: "group"
}

export type DatabaseFilterItemConfig =
  | DatabaseFilterGroupConfig
  | DatabasePropertyFilterConfig

export type DatabasePredicateContext = {
  getPropertyType: (propertyId: string) => string | null | undefined
  getPropertyValues: (propertyId: string) => string[]
  now?: Date
  timezone?: string
}

export const databasePropertyFilterOperators: Array<{
  label: string
  value: DatabasePropertyFilterOperator
}> = [
  { label: "Is", value: "is" },
  { label: "Is not", value: "is_not" },
  { label: "Contains", value: "contains" },
  { label: "Does not contain", value: "does_not_contain" },
  { label: "Starts with", value: "starts_with" },
  { label: "Ends with", value: "ends_with" },
  { label: "Is empty", value: "is_empty" },
  { label: "Is not empty", value: "is_not_empty" },
]

export const databaseNumberFilterOperators: Array<{
  label: string
  value: DatabasePropertyFilterOperator
}> = [
  { label: "Is", value: "is" },
  { label: "Is not", value: "is_not" },
  { label: "Greater than", value: "greater_than" },
  { label: "Less than", value: "less_than" },
  { label: "Greater than or equal", value: "greater_than_or_equal" },
  { label: "Less than or equal", value: "less_than_or_equal" },
  { label: "Is empty", value: "is_empty" },
  { label: "Is not empty", value: "is_not_empty" },
]

export const databaseDateFilterOperators: Array<{
  label: string
  value: DatabasePropertyFilterOperator
}> = [
  { label: "Is", value: "is" },
  { label: "Is not", value: "is_not" },
  { label: "Is before", value: "is_before" },
  { label: "Is after", value: "is_after" },
  { label: "Is on or before", value: "is_on_or_before" },
  { label: "Is on or after", value: "is_on_or_after" },
  { label: "Is between", value: "is_between" },
  { label: "Is relative to today", value: "is_relative_to_today" },
  { label: "Is empty", value: "is_empty" },
  { label: "Is not empty", value: "is_not_empty" },
]

const allDatabaseFilterOperators = [
  ...databasePropertyFilterOperators,
  ...databaseNumberFilterOperators,
  ...databaseDateFilterOperators,
]

export function getDatabaseFilterOperatorLabel(
  operator: DatabasePropertyFilterOperator,
) {
  return allDatabaseFilterOperators.find((item) => item.value === operator)?.label ?? "Is"
}

export function getDatabasePropertyFilterKind(type: string) {
  if (type === "checkbox") return "checkbox"
  if (type === "created_time" || type === "date" || type === "edited_time") return "date"
  if (type === "files") return "files"
  if (type === "number") return "number"
  if (type === "person") return "person"
  return "text"
}

export function getDatabaseFilterOperatorsForType(type: string) {
  const filterKind = getDatabasePropertyFilterKind(type)

  if (filterKind === "checkbox") {
    return databasePropertyFilterOperators.filter((operator) =>
      ["is", "is_not"].includes(operator.value),
    )
  }
  if (filterKind === "date") return databaseDateFilterOperators
  if (filterKind === "number") return databaseNumberFilterOperators
  if (filterKind === "person") {
    return databasePropertyFilterOperators.filter((operator) =>
      ["contains", "does_not_contain", "is_empty", "is_not_empty"].includes(
        operator.value,
      ),
    )
  }
  if (filterKind === "files") {
    return databasePropertyFilterOperators.filter((operator) =>
      ["is_empty", "is_not_empty"].includes(operator.value),
    )
  }

  return databasePropertyFilterOperators
}

export function getValidDatabaseFilterOperator(
  operator: DatabasePropertyFilterOperator,
  type: string,
) {
  const operators = getDatabaseFilterOperatorsForType(type)

  return operators.some((item) => item.value === operator)
    ? operator
    : (operators[0]?.value ?? "is")
}

export function isDatabaseFilterGroup(
  filter: DatabaseFilterItemConfig,
): filter is DatabaseFilterGroupConfig {
  return "type" in filter && filter.type === "group"
}

export function normalizeDatabaseFilters(values: unknown[]) {
  return normalizeDatabaseFilterList(values, 0)
}

function normalizeDatabaseFilterList(
  values: unknown[],
  depth: number,
): DatabaseFilterItemConfig[] {
  if (depth > 5) return []

  return values.slice(0, 100).flatMap((value, index) => {
    const filter = normalizeDatabaseFilter(value, `filter-${index}`, depth)

    return filter ? [filter] : []
  })
}

export function normalizeDatabaseFilter(
  value: unknown,
  fallbackId: string,
  depth = 0,
): DatabaseFilterItemConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  if (record.type === "group" && Array.isArray(record.filters)) {
    return {
      filters: normalizeDatabaseFilterList(record.filters, depth + 1),
      id: getFilterId(record, fallbackId),
      joinOperator: getGroupOperator(record.joinOperator),
      operator: getGroupOperator(record.operator) ?? "and",
      type: "group",
    }
  }

  const propertyId = record.propertyId === "title" ? "name" : record.propertyId
  const operator = allDatabaseFilterOperators.some(
    (candidate) => candidate.value === record.operator,
  )
    ? (record.operator as DatabasePropertyFilterOperator)
    : null

  if (typeof propertyId !== "string" || !propertyId || !operator) return null

  return {
    id: getFilterId(record, fallbackId),
    joinOperator: getGroupOperator(record.joinOperator),
    operator,
    propertyId,
    values: Array.isArray(record.values)
      ? record.values.flatMap((item) =>
          typeof item === "boolean" ||
          typeof item === "number" ||
          typeof item === "string"
            ? [String(item)]
            : [],
        )
      : [],
  }
}

function getFilterId(record: Record<string, unknown>, fallbackId: string) {
  return typeof record.id === "string" && record.id ? record.id : fallbackId
}

function getGroupOperator(value: unknown) {
  return value === "and" || value === "or" ? value : undefined
}

function normalizeText(value: string) {
  return value.normalize("NFKC").trim().toLowerCase()
}

function numberValue(value: string | undefined) {
  if (value === undefined || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function compareNumber(
  rowValue: number | null,
  filterValue: number | null,
  operator: DatabasePropertyFilterOperator,
) {
  if (rowValue === null || filterValue === null) return operator === "is_not"
  if (operator === "is_not") return rowValue !== filterValue
  if (operator === "greater_than") return rowValue > filterValue
  if (operator === "less_than") return rowValue < filterValue
  if (operator === "greater_than_or_equal") return rowValue >= filterValue
  if (operator === "less_than_or_equal") return rowValue <= filterValue
  return rowValue === filterValue
}

function parseDate(value: string | undefined, timezone?: string) {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dateOnly) {
    return zonedDatePartsToDate(
      {
        day: Number(dateOnly[3]),
        hour: 0,
        millisecond: 0,
        minute: 0,
        month: Number(dateOnly[2]),
        second: 0,
        year: Number(dateOnly[1]),
      },
      timezone,
    )
  }

  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime())
    ? startOfDayInTimezone(parsed, timezone)
    : null
}

function relativeDateRange(
  value: string | undefined,
  now: Date,
  timezone?: string,
) {
  const [, direction = "this", unit = "week"] =
    (value ?? "relative:this:week").split(":")
  const today = getZonedDateParts(now, timezone)
  const startCursor = new Date(Date.UTC(today.year, today.month - 1, today.day))
  const endCursor = new Date(startCursor)

  if (unit === "day") {
    const offset = direction === "past" ? -1 : direction === "next" ? 1 : 0
    startCursor.setUTCDate(startCursor.getUTCDate() + offset)
    endCursor.setUTCDate(endCursor.getUTCDate() + offset)
  } else if (unit === "week") {
    startCursor.setUTCDate(startCursor.getUTCDate() - startCursor.getUTCDay())
    endCursor.setTime(startCursor.getTime())
    endCursor.setUTCDate(endCursor.getUTCDate() + 6)
  } else if (unit === "month") {
    startCursor.setUTCDate(1)
    endCursor.setUTCMonth(startCursor.getUTCMonth() + 1, 0)
  } else {
    startCursor.setUTCMonth(0, 1)
    endCursor.setUTCMonth(11, 31)
  }

  if (unit !== "day" && direction !== "this") {
    const amount = direction === "past" ? -1 : 1
    if (unit === "week") {
      startCursor.setUTCDate(startCursor.getUTCDate() + 7 * amount)
      endCursor.setUTCDate(endCursor.getUTCDate() + 7 * amount)
    } else if (unit === "month") {
      startCursor.setUTCMonth(startCursor.getUTCMonth() + amount)
      endCursor.setUTCMonth(endCursor.getUTCMonth() + amount)
    } else {
      startCursor.setUTCFullYear(startCursor.getUTCFullYear() + amount)
      endCursor.setUTCFullYear(endCursor.getUTCFullYear() + amount)
    }
  }

  const toZonedStart = (cursor: Date) =>
    zonedDatePartsToDate(
      {
        day: cursor.getUTCDate(),
        hour: 0,
        millisecond: 0,
        minute: 0,
        month: cursor.getUTCMonth() + 1,
        second: 0,
        year: cursor.getUTCFullYear(),
      },
      timezone,
    )

  return { end: toZonedStart(endCursor), start: toZonedStart(startCursor) }
}

function compareDate(
  rowDate: Date | null,
  filter: DatabasePropertyFilterConfig,
  now: Date,
  timezone?: string,
) {
  if (!rowDate) return filter.operator === "is_not"
  if (filter.operator === "is_relative_to_today") {
    const range = relativeDateRange(filter.values[0], now, timezone)
    return rowDate >= range.start && rowDate <= range.end
  }

  const filterDate = parseDate(filter.values[0], timezone)
  if (!filterDate) return true
  if (filter.operator === "is_before") return rowDate < filterDate
  if (filter.operator === "is_after") return rowDate > filterDate
  if (filter.operator === "is_on_or_before") return rowDate <= filterDate
  if (filter.operator === "is_on_or_after") return rowDate >= filterDate
  if (filter.operator === "is_between") {
    const second = parseDate(filter.values[1], timezone)
    if (!second) return rowDate >= filterDate
    const start = filterDate <= second ? filterDate : second
    const end = filterDate <= second ? second : filterDate
    return rowDate >= start && rowDate <= end
  }
  if (filter.operator === "is_not") return rowDate.getTime() !== filterDate.getTime()
  return rowDate.getTime() === filterDate.getTime()
}

export function evaluateDatabasePropertyFilter(
  filter: DatabasePropertyFilterConfig,
  context: DatabasePredicateContext,
) {
  const timezone = getRuntimeTimezone(context.timezone)
  const propertyType =
    filter.propertyId === "name"
      ? "text"
      : (context.getPropertyType(filter.propertyId) ?? "text")
  const rowValues = context.getPropertyValues(filter.propertyId)
  const normalizedRowValues = rowValues.map(normalizeText)
  const normalizedFilterValues = filter.values.map(normalizeText)
  const hasRowValue = normalizedRowValues.some(Boolean)

  if (filter.operator === "is_empty") return !hasRowValue
  if (filter.operator === "is_not_empty") return hasRowValue
  if (filter.values.length === 0) return true
  if (getDatabasePropertyFilterKind(propertyType) === "date") {
    return compareDate(
      parseDate(rowValues[0], timezone),
      filter,
      context.now ? new Date(context.now) : new Date(),
      timezone,
    )
  }
  if (propertyType === "number") {
    return compareNumber(
      numberValue(rowValues[0]),
      numberValue(filter.values[0]),
      filter.operator,
    )
  }
  if (filter.operator === "is_not") {
    return !normalizedFilterValues.some((value) => normalizedRowValues.includes(value))
  }
  if (filter.operator === "contains") {
    return normalizedFilterValues.some((value) =>
      normalizedRowValues.some((rowValue) => rowValue.includes(value)),
    )
  }
  if (filter.operator === "does_not_contain") {
    return !normalizedFilterValues.some((value) =>
      normalizedRowValues.some((rowValue) => rowValue.includes(value)),
    )
  }
  if (filter.operator === "starts_with") {
    return normalizedFilterValues.some((value) =>
      normalizedRowValues.some((rowValue) => rowValue.startsWith(value)),
    )
  }
  if (filter.operator === "ends_with") {
    return normalizedFilterValues.some((value) =>
      normalizedRowValues.some((rowValue) => rowValue.endsWith(value)),
    )
  }

  return normalizedFilterValues.some((value) => normalizedRowValues.includes(value))
}

export function evaluateDatabaseFilter(
  filter: DatabaseFilterItemConfig,
  context: DatabasePredicateContext,
): boolean {
  if (!isDatabaseFilterGroup(filter)) {
    return evaluateDatabasePropertyFilter(filter, context)
  }

  return evaluateDatabaseFilters(filter.filters, context, filter.operator)
}

export function evaluateDatabaseFilters(
  filters: DatabaseFilterItemConfig[],
  context: DatabasePredicateContext,
  operator: DatabaseFilterGroupOperator = "and",
) {
  if (filters.length === 0) return true

  const [first, ...remaining] = filters
  let matches = evaluateDatabaseFilter(first, context)
  for (const filter of remaining) {
    const next = evaluateDatabaseFilter(filter, context)
    matches =
      (filter.joinOperator ?? operator) === "or"
        ? matches || next
        : matches && next
  }

  return matches
}
