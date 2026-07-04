import type {
  DatabasePayload,
  DatabaseProperty,
} from "@notelab/features/databases"

import {
  getPropertyValue,
  toStringArray,
  type DatabasePropertyValue,
} from "../utils"
import {
  getReadOnlyTimePropertyRawValue,
  isReadOnlyTimeProperty,
} from "../shared/read-only-time-property"
import type { DatabaseRollupCalculation } from "../shared/database-view-config"
import {
  getRollupConfig,
  getValidRollupCalculation,
  type DatabaseRollupConfig,
} from "./rollup-config"

export type DatabaseRollupEvaluationResult = {
  displayValue: string
  kind: "empty" | "error" | "number" | "text"
  value: string | number | null
}

type RollupTargetValue = {
  empty: boolean
  text: string
  value: DatabasePropertyValue
}

type DatabaseRollupRow = {
  createdAt: string
  id: string
  page: {
    createdAt?: string
    id?: string
    name?: string
    updatedAt?: string
  }
  pageId: string
  updatedAt: string
}

export function evaluateDatabaseRollup({
  currentRow,
  propertyConfig,
  propertyValuesByKey,
  relatedDatabasePayload,
  relationProperty,
}: {
  currentRow: DatabaseRollupRow
  propertyConfig: unknown
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  relatedDatabasePayload: DatabasePayload | null | undefined
  relationProperty: DatabaseProperty | null | undefined
}): DatabaseRollupEvaluationResult {
  const config = getRollupConfig(propertyConfig)

  if (!config.relationPropertyId || !config.targetPropertyId) {
    return textResult("Configure rollup", "empty")
  }

  if (!relationProperty) {
    return textResult("Select a relation", "empty")
  }

  if (!relatedDatabasePayload) {
    return textResult("Loading...", "empty")
  }

  const targetProperty = getRollupTargetProperty(
    relatedDatabasePayload.properties,
    config.targetPropertyId
  )

  if (!targetProperty) {
    return textResult("Select a property", "empty")
  }

  const relatedPageIds = toStringArray(
    propertyValuesByKey[`${currentRow.pageId}:${relationProperty.property.id}`] ??
      ""
  )
  const relatedRowsByPageId = new Map(
    relatedDatabasePayload.rows.map((row) => [row.pageId, row])
  )
  const values = relatedPageIds.map((pageId) =>
    getRollupTargetValue({
      pageId,
      payload: relatedDatabasePayload,
      row: relatedRowsByPageId.get(pageId),
      targetProperty,
    })
  )
  const calculation = getValidRollupCalculation(
    config.calculation,
    targetProperty.type
  )

  return calculateRollupValue(values, calculation, config)
}

export function getRollupTargetProperty(
  properties: DatabaseProperty[],
  propertyId: string
): { id: string; name: string; type: string } | null {
  if (propertyId === "name") {
    return { id: "name", name: "Name", type: "text" }
  }

  const property = properties.find(
    (item) => item.property.id === propertyId && item.property.type !== "rollup"
  )

  return property
    ? {
        id: property.property.id,
        name: property.property.name,
        type: property.property.type,
      }
    : null
}

export function getRollupRelationProperty(
  properties: DatabaseProperty[],
  relationPropertyId: string | undefined
) {
  return properties.find(
    (item) =>
      item.property.type === "relation" &&
      (item.id === relationPropertyId || item.property.id === relationPropertyId)
  )
}

function calculateRollupValue(
  values: RollupTargetValue[],
  calculation: DatabaseRollupCalculation,
  config: DatabaseRollupConfig
): DatabaseRollupEvaluationResult {
  const nonEmptyValues = values.filter((value) => !value.empty)
  const uniqueValues = uniqueByText(nonEmptyValues)

  if (calculation === "show_original") {
    return textResult(nonEmptyValues.map((value) => value.text).join(", "))
  }

  if (calculation === "show_unique") {
    return textResult(uniqueValues.map((value) => value.text).join(", "))
  }

  if (calculation === "count_all") {
    return numberResult(values.length, config)
  }

  if (calculation === "count_values") {
    return numberResult(nonEmptyValues.length, config)
  }

  if (calculation === "count_unique") {
    return numberResult(uniqueValues.length, config)
  }

  if (calculation === "count_empty") {
    return numberResult(values.length - nonEmptyValues.length, config)
  }

  if (calculation === "count_not_empty") {
    return numberResult(nonEmptyValues.length, config)
  }

  if (calculation === "percent_empty") {
    return numberResult(getPercent(values.length - nonEmptyValues.length, values.length), {
      ...config,
      numberFormat: "percent",
    })
  }

  if (calculation === "percent_not_empty") {
    return numberResult(getPercent(nonEmptyValues.length, values.length), {
      ...config,
      numberFormat: "percent",
    })
  }

  const numbers = nonEmptyValues.flatMap((item) => {
    const number = toNumber(item.value)

    return number === null ? [] : [number]
  })

  if (calculation === "sum") {
    return numberResult(numbers.reduce((sum, number) => sum + number, 0), config)
  }

  if (calculation === "average") {
    return numberResult(
      numbers.length ? numbers.reduce((sum, number) => sum + number, 0) / numbers.length : 0,
      config
    )
  }

  if (calculation === "median") {
    return numberResult(getMedian(numbers), config)
  }

  if (calculation === "min") {
    return numberResult(numbers.length ? Math.min(...numbers) : 0, config)
  }

  if (calculation === "max") {
    return numberResult(numbers.length ? Math.max(...numbers) : 0, config)
  }

  if (calculation === "range") {
    return numberResult(
      numbers.length ? Math.max(...numbers) - Math.min(...numbers) : 0,
      config
    )
  }

  const dates = nonEmptyValues.flatMap((item) => {
    const date = toDate(item.value)

    return date ? [date] : []
  })

  if (calculation === "earliest_date") {
    return textResult(formatDate(dates.length ? new Date(Math.min(...dates.map(Number))) : null))
  }

  if (calculation === "latest_date") {
    return textResult(formatDate(dates.length ? new Date(Math.max(...dates.map(Number))) : null))
  }

  if (calculation === "date_range") {
    if (!dates.length) {
      return textResult("")
    }

    const earliest = new Date(Math.min(...dates.map(Number)))
    const latest = new Date(Math.max(...dates.map(Number)))

    return textResult(`${formatDate(earliest)} - ${formatDate(latest)}`)
  }

  return textResult("")
}

function getRollupTargetValue({
  pageId,
  payload,
  row,
  targetProperty,
}: {
  pageId: string
  payload: DatabasePayload
  row: DatabaseRollupRow | undefined
  targetProperty: { id: string; type: string }
}): RollupTargetValue {
  if (targetProperty.id === "name") {
    const value = row?.page.name ?? ""

    return {
      empty: !value.trim(),
      text: value,
      value,
    }
  }

  const value =
    row && isReadOnlyTimeProperty(targetProperty.type)
      ? getReadOnlyTimePropertyRawValue(row, targetProperty.type)
      : getPropertyValue(payload.values, pageId, targetProperty.id, targetProperty.type)
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : value

  return {
    empty: Array.isArray(value)
      ? value.length === 0 || value.every((item) => !item.trim())
      : !value.trim(),
    text,
    value,
  }
}

function textResult(
  value: string,
  kind: "empty" | "error" | "text" = "text"
): DatabaseRollupEvaluationResult {
  return {
    displayValue: value,
    kind,
    value,
  }
}

function numberResult(
  value: number,
  config: Pick<DatabaseRollupConfig, "numberDecimalPlaces" | "numberFormat">
): DatabaseRollupEvaluationResult {
  return {
    displayValue: formatRollupNumber(value, config),
    kind: "number",
    value,
  }
}

function formatRollupNumber(
  value: number,
  config: Pick<DatabaseRollupConfig, "numberDecimalPlaces" | "numberFormat">
) {
  const format = config.numberFormat.trim().toLowerCase()
  const options: Intl.NumberFormatOptions = {
    useGrouping: format !== "number",
  }
  const currencyCode = /^[A-Z]{3}$/.test(format.toUpperCase())
    ? format.toUpperCase()
    : null

  if (config.numberDecimalPlaces !== "default") {
    options.minimumFractionDigits = config.numberDecimalPlaces
    options.maximumFractionDigits = config.numberDecimalPlaces
  }

  if (format === "number" && config.numberDecimalPlaces === "default") {
    return String(value)
  }

  if (format === "percent") {
    options.style = "percent"
  } else if (currencyCode) {
    options.currency = currencyCode
    options.style = "currency"
  }

  return new Intl.NumberFormat(undefined, options).format(value)
}

function uniqueByText(values: RollupTargetValue[]) {
  const seen = new Set<string>()

  return values.filter((value) => {
    if (seen.has(value.text)) {
      return false
    }

    seen.add(value.text)
    return true
  })
}

function getPercent(count: number, total: number) {
  return total ? count / total : 0
}

function toNumber(value: DatabasePropertyValue) {
  const nextValue = Number(Array.isArray(value) ? value[0] : value)

  return Number.isFinite(nextValue) ? nextValue : null
}

function getMedian(values: number[]) {
  if (!values.length) {
    return 0
  }

  const sortedValues = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sortedValues.length / 2)

  return sortedValues.length % 2 === 0
    ? ((sortedValues[middle - 1] ?? 0) + (sortedValues[middle] ?? 0)) / 2
    : (sortedValues[middle] ?? 0)
}

function toDate(value: DatabasePropertyValue) {
  const dateValue = Array.isArray(value) ? value[0] : value

  if (!dateValue) {
    return null
  }

  const date = new Date(dateValue)

  return Number.isFinite(date.getTime()) ? date : null
}

function formatDate(date: Date | null) {
  if (!date || !Number.isFinite(date.getTime())) {
    return ""
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
