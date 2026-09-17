import type {
  DatabaseInitialPageSize,
  DatabasePropertyEntity,
  DatabaseRecordEntity,
} from  "../core/entities"
import {
  evaluateDatabaseFilters,
  normalizeDatabaseFilters,
  type DatabasePredicateContext,
} from  "../schema/filter"
import type { DatabaseFormulaPropertyValue, FormulaValue } from  "../schema/formula"
import { createDatabaseRowSnapshot } from  "../records/row-snapshot"

type DatabaseViewSort = {
  column: string
  direction: "ascending" | "descending"
}

export const DEFAULT_DATABASE_INITIAL_PAGE_SIZE: DatabaseInitialPageSize = 50

const allowedPageSizes = new Set<DatabaseInitialPageSize>([10, 25, 50, 100])

export function getDatabaseInitialPageSize(
  config: unknown,
): DatabaseInitialPageSize {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return DEFAULT_DATABASE_INITIAL_PAGE_SIZE
  }

  const value = (config as { initialPageSize?: unknown }).initialPageSize
  return allowedPageSizes.has(value as DatabaseInitialPageSize)
    ? (value as DatabaseInitialPageSize)
    : DEFAULT_DATABASE_INITIAL_PAGE_SIZE
}

function getViewSorts(config: unknown): DatabaseViewSort[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return []
  const sorts = (config as { sorts?: unknown }).sorts
  if (!Array.isArray(sorts)) return []

  return sorts.flatMap((sort) => {
    if (!sort || typeof sort !== "object" || Array.isArray(sort)) return []
    const candidate = sort as { column?: unknown; direction?: unknown }
    return typeof candidate.column === "string" &&
        (candidate.direction === "ascending" ||
          candidate.direction === "descending")
      ? [{ column: candidate.column, direction: candidate.direction }]
      : []
  })
}

function rawFormulaValue(value: unknown): DatabaseFormulaPropertyValue {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === "string" || typeof item === "number" ||
          typeof item === "boolean"
        ? [String(item)]
        : [],
    )
  }
  if (typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean") {
    return String(value)
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const start = (value as { start?: unknown }).start
    if (typeof start === "string") return start
  }
  return ""
}

function comparable(value: FormulaValue): number | string | null {
  if (value === null) return null
  if (value instanceof Date) return value.getTime()
  if (Array.isArray(value)) return value.map(String).join(", ")
  if (typeof value === "boolean") return value ? 1 : 0
  return value
}

function compareValues(
  left: number | string | null,
  right: number | string | null,
) {
  const leftEmpty = left === null || left === ""
  const rightEmpty = right === null || right === ""
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0
    return leftEmpty ? 1 : -1
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

function strings(value: FormulaValue, propertyType: string): string[] {
  if (value === null) return []
  if (propertyType === "checkbox" && typeof value === "boolean") {
    return [value ? "Checked" : "Unchecked"]
  }
  const values = Array.isArray(value) ? value : [value]
  return values.map((item) => item instanceof Date
    ? item.toISOString()
    : String(item).trim()).filter(Boolean)
}

export function evaluateDatabaseRecordsForView(input: {
  config: unknown
  now?: Date
  properties: DatabasePropertyEntity[]
  records: DatabaseRecordEntity[]
  timezone?: string
}) {
  const propertiesByColumnId = new Map(
    input.properties.map((property) => [property.id, property]),
  )
  const valuesByRecordId = new Map<string, Record<string, FormulaValue>>()

  for (const record of input.records) {
    const propertyValuesByKey: Record<string, DatabaseFormulaPropertyValue> = {}
    for (const property of input.properties) {
      const value = record.valuesByPropertyId[property.property.id]?.value
      propertyValuesByKey[`${record.pageId}:${property.property.id}`] =
        rawFormulaValue(value)
    }
    valuesByRecordId.set(
      record.id,
      createDatabaseRowSnapshot(
        {
          properties: input.properties,
          propertyValuesByKey,
          row: {
            createdAt: record.createdAt,
            id: record.id,
            page: record.page,
            pageId: record.pageId,
            updatedAt: record.updatedAt,
          },
        },
        { now: input.now, timezone: input.timezone },
      ).values,
    )
  }

  const filters = input.config && typeof input.config === "object" &&
      !Array.isArray(input.config) &&
      Array.isArray((input.config as { filters?: unknown }).filters)
    ? normalizeDatabaseFilters(
        (input.config as { filters: unknown[] }).filters,
      )
    : []

  const filtered = filters.length === 0
    ? input.records
    : input.records.filter((record) => {
        const values = valuesByRecordId.get(record.id) ?? {}
        const context: DatabasePredicateContext = {
          getPropertyType(columnId) {
            return columnId === "name"
              ? "text"
              : propertiesByColumnId.get(columnId)?.property.type ?? null
          },
          getPropertyValues(columnId) {
            if (columnId === "name") {
              return record.page.name.trim() ? [record.page.name.trim()] : []
            }
            const property = propertiesByColumnId.get(columnId)
            return property
              ? strings(
                  values[property.property.id] ?? null,
                  property.property.type,
                )
              : []
          },
          now: input.now,
          timezone: input.timezone,
        }
        return evaluateDatabaseFilters(filters, context)
      })

  const sorts = getViewSorts(input.config)
  if (sorts.length === 0) return filtered

  return [...filtered].sort((left, right) => {
    for (const sort of sorts) {
      const property = propertiesByColumnId.get(sort.column)
      const leftValue = sort.column === "name"
        ? left.page.name.trim()
        : comparable(
            property
              ? valuesByRecordId.get(left.id)?.[property.property.id] ?? null
              : null,
          )
      const rightValue = sort.column === "name"
        ? right.page.name.trim()
        : comparable(
            property
              ? valuesByRecordId.get(right.id)?.[property.property.id] ?? null
              : null,
          )
      const comparison = compareValues(leftValue, rightValue)
      if (comparison !== 0) {
        return sort.direction === "descending" ? -comparison : comparison
      }
    }
    return left.orderKey.localeCompare(right.orderKey, undefined, {
      numeric: true,
    }) || left.id.localeCompare(right.id)
  })
}
