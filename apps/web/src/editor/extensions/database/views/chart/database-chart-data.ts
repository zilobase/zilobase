import type { DatabaseProperty } from "@notelab/features/databases"

import {
  cyclingColorTokens,
  getPaletteColor,
  type ColorTokenId,
} from "@/lib/color-tokens"
import type { DatabasePropertyValue } from "../../core/utils"
import { formatDatabaseDateValue } from "../../properties/database-date-config"
import { getReadOnlyTimePropertyRawValue } from "../../properties/read-only-time-property"
import { getSelectOptions } from "../kanban/database-kanban-config"
import type {
  DatabaseChartDateInterval,
  DatabaseChartSort,
} from "./database-chart-config"

export type DatabaseChartDataItem = {
  color: string
  count: number
  name: string
  [key: string]: string | number
}

export type DatabaseChartSeriesItem = {
  color: string
  key: string
  label: string
}

export type DatabaseChartPieSegment = {
  color: string
  name: string
  value: number
}

type PersonNameMap = Map<string, string>

export type DatabaseChartRow = {
  createdAt: string
  id: string
  page: {
    createdAt?: string
    name?: string
    updatedAt?: string
  }
  pageId: string
  updatedAt: string
}

export const DEFAULT_CHART_COLOR = "var(--primary)"

function getChartColor(color?: string | null) {
  return getPaletteColor(color) ?? DEFAULT_CHART_COLOR
}

function getRawPropertyValue(
  row: DatabaseChartRow,
  property: DatabaseProperty,
  propertyValuesByKey: Record<string, DatabasePropertyValue>,
): DatabasePropertyValue {
  if (
    property.property.type === "created_time" ||
    property.property.type === "edited_time"
  ) {
    return getReadOnlyTimePropertyRawValue(row, property.property.type)
  }

  return propertyValuesByKey[`${row.pageId}:${property.property.id}`] ?? ""
}

function formatPropertyPart(
  value: string,
  property: DatabaseProperty,
  personNamesById: PersonNameMap,
) {
  if (property.property.type === "person") {
    return personNamesById.get(value) ?? value
  }

  if (
    property.property.type === "date" ||
    property.property.type === "created_time" ||
    property.property.type === "edited_time"
  ) {
    return formatDatabaseDateValue(value, property.property.config) || value
  }

  return value
}

function getChartLabelState({
  personNamesById,
  property,
  propertyValuesByKey,
  row,
}: {
  personNamesById: PersonNameMap
  property: DatabaseProperty | null
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  row: DatabaseChartRow
}) {
  if (!property) {
    const label = row.page.name?.trim() ?? ""

    return { isEmpty: !label, label: label || "Untitled" }
  }

  const value = getRawPropertyValue(row, property, propertyValuesByKey)

  if (property.property.type === "checkbox") {
    return {
      isEmpty: false,
      label: value === "true" ? "True" : "False",
    }
  }

  const values = (Array.isArray(value) ? value : [value])
    .map((item) => item.trim())
    .filter(Boolean)
  const labels = values.map((item) =>
    formatPropertyPart(item, property, personNamesById),
  )

  return {
    isEmpty: labels.length === 0,
    label: labels.length > 0 ? labels.join(", ") : "Empty",
  }
}

function getChartGroupLabels({
  dateInterval,
  personNamesById,
  property,
  propertyValuesByKey,
  row,
}: {
  dateInterval?: DatabaseChartDateInterval
  personNamesById: PersonNameMap
  property: DatabaseProperty | null
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  row: DatabaseChartRow
}) {
  if (!property) {
    return [
      getChartLabelState({ personNamesById, property, propertyValuesByKey, row })
        .label,
    ]
  }

  if (property.property.type === "checkbox") {
    return [
      getChartLabelState({ personNamesById, property, propertyValuesByKey, row })
        .label,
    ]
  }

  const value = getRawPropertyValue(row, property, propertyValuesByKey)
  const values =
    dateInterval && isDateProperty(property)
      ? [Array.isArray(value) ? value[0] : value]
      : Array.isArray(value)
        ? value
        : [value]
  const labels = values
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      dateInterval && isDateProperty(property)
        ? formatChartDateInterval(item, dateInterval)
        : formatPropertyPart(item, property, personNamesById),
    )

  return labels.length > 0
    ? labels
    : [`No ${property.property.name?.trim() || "property"}`]
}

function isDateProperty(property: DatabaseProperty) {
  return ["date", "created_time", "edited_time"].includes(
    property.property.type,
  )
}

function formatChartDateInterval(
  value: string,
  interval: DatabaseChartDateInterval,
) {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      )
    : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  if (interval === "year") {
    return String(date.getFullYear())
  }

  if (interval === "quarter") {
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`
  }

  if (interval === "month") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(date)
  }

  if (interval === "week") {
    const weekStart = new Date(date)
    const day = weekStart.getDay()
    weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1))

    return `Week of ${new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(weekStart)}`
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

export function sortDatabaseChartData(
  data: DatabaseChartDataItem[],
  sort: DatabaseChartSort = "value-desc",
) {
  if (sort === "manual") {
    return [...data]
  }

  return [...data].sort((firstItem, secondItem) => {
    if (sort === "axis-asc" || sort === "axis-desc") {
      const comparison = firstItem.name.localeCompare(secondItem.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })

      return sort === "axis-asc" ? comparison : -comparison
    }

    const comparison = firstItem.count - secondItem.count
    return sort === "value-asc" ? comparison : -comparison
  })
}

export function getChartMeasureValue(
  row: DatabaseChartRow,
  property: DatabaseProperty | null,
  propertyValuesByKey: Record<string, DatabasePropertyValue>,
) {
  if (!property) {
    return 1
  }

  const value = getRawPropertyValue(row, property, propertyValuesByKey)

  if (property.property.type === "number") {
    const numericValue = Array.isArray(value) ? value[0] : value
    const parsedValue = Number(numericValue)

    return Number.isFinite(parsedValue) ? parsedValue : 0
  }

  if (property.property.type === "checkbox") {
    return value === "true" ? 1 : 0
  }

  if (Array.isArray(value)) {
    return value.filter((item) => item.trim()).length
  }

  return value.trim() ? 1 : 0
}

export function getChartValueColorKey(
  property: DatabaseProperty | null,
  label: string,
) {
  return `${property?.property.id ?? "name"}:${label}`
}

function getChartSeriesKey(property: DatabaseProperty, label: string) {
  const labelKey = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  return `series-${property.property.id}-${labelKey || "empty"}`
}

export function getRandomChartColor(): ColorTokenId {
  const colors = cyclingColorTokens.flatMap((color) =>
    color.value ? [color.value as ColorTokenId] : [],
  )
  const index =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint32Array(1))[0] % colors.length
      : Math.floor(Math.random() * colors.length)

  return colors[index] ?? "blue"
}

export function getColorVariant(color: string, index: number) {
  const mixPercentages = [0, 18, 32, 46, 60, 12, 26, 40]
  const mixTarget = index % 2 === 0 ? "black" : "white"
  const mixPercentage = mixPercentages[index % mixPercentages.length]

  if (mixPercentage === 0) {
    return color
  }

  return `color-mix(in srgb, ${color} ${100 - mixPercentage}%, ${mixTarget})`
}

export function getChartGroupProperty(
  properties: DatabaseProperty[],
  groupByPropertyId: string | undefined,
) {
  if (groupByPropertyId === "name") {
    return null
  }

  return (
    properties.find(
      (property) => property.property.id === groupByPropertyId,
    ) ??
    properties.find((property) =>
      ["select", "status", "checkbox", "person"].includes(
        property.property.type,
      ),
    ) ??
    properties.find((property) => property.property.type !== "number") ??
    null
  )
}

function getOptionColor(
  property: DatabaseProperty | null,
  label: string,
  valueColors: Record<string, ColorTokenId>,
) {
  const configuredColor = property
    ? getSelectOptions(property.property.config).find(
        (option) => option.name === label,
      )?.color
    : undefined

  return getChartColor(
    configuredColor && configuredColor !== "default"
      ? configuredColor
      : valueColors[getChartValueColorKey(property, label)],
  )
}

export function createChartData({
  groupByPropertyId,
  hiddenGroupNames,
  measurePropertyId,
  omitZeroValues,
  personNamesById,
  properties,
  propertyValuesByKey,
  rows,
  sort,
  valueColors,
}: {
  groupByPropertyId?: string
  hiddenGroupNames?: string[]
  measurePropertyId?: string
  omitZeroValues: boolean
  personNamesById: PersonNameMap
  properties: DatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  rows: DatabaseChartRow[]
  sort?: DatabaseChartSort
  valueColors: Record<string, ColorTokenId>
}): DatabaseChartDataItem[] {
  const groupProperty = getChartGroupProperty(properties, groupByPropertyId)
  const measureProperty =
    measurePropertyId === "count"
      ? null
      : properties.find(
          (property) => property.property.id === measurePropertyId,
        ) ?? null
  const counts = new Map<string, number>()
  const colors = new Map<string, string>()
  const selectOptions = groupProperty
    ? getSelectOptions(groupProperty.property.config)
    : []
  const hiddenGroups = new Set(hiddenGroupNames)

  if (!omitZeroValues) {
    for (const option of selectOptions) {
      counts.set(option.name, 0)
      colors.set(
        option.name,
        getChartColor(
          option.color && option.color !== "default"
            ? option.color
            : valueColors[getChartValueColorKey(groupProperty, option.name)],
        ),
      )
    }

    if (groupProperty?.property.type === "checkbox") {
      counts.set("True", 0)
      counts.set("False", 0)
      colors.set("True", getChartColor("green"))
      colors.set("False", getChartColor("gray"))
    }
  }

  for (const row of rows) {
    const { isEmpty, label } = getChartLabelState({
      personNamesById,
      property: groupProperty,
      propertyValuesByKey,
      row,
    })

    if (omitZeroValues && isEmpty) {
      continue
    }

    const measureValue = getChartMeasureValue(
      row,
      measureProperty,
      propertyValuesByKey,
    )

    if (omitZeroValues && measureValue === 0) {
      continue
    }

    counts.set(label, (counts.get(label) ?? 0) + measureValue)

    if (!colors.has(label)) {
      colors.set(
        label,
        label === "True"
          ? getChartColor("green")
          : label === "False"
            ? getChartColor("gray")
            : getOptionColor(groupProperty, label, valueColors),
      )
    }
  }

  return sortDatabaseChartData(
    Array.from(counts, ([name, count]) => ({
      color: colors.get(name) ?? DEFAULT_CHART_COLOR,
      count,
      name,
    })).filter(
      (item) =>
        !hiddenGroups.has(item.name) &&
        (!omitZeroValues || item.count > 0),
    ),
    sort,
  ).slice(0, 12)
}

export function createSplitChartData({
  axisProperty,
  dateInterval,
  hiddenGroupNames,
  measureProperty,
  omitZeroValues,
  personNamesById,
  propertyValuesByKey,
  rows,
  sort,
  splitProperty,
  valueColors,
}: {
  axisProperty: DatabaseProperty | null
  dateInterval?: DatabaseChartDateInterval
  hiddenGroupNames?: string[]
  measureProperty: DatabaseProperty | null
  omitZeroValues: boolean
  personNamesById: PersonNameMap
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  rows: DatabaseChartRow[]
  sort?: DatabaseChartSort
  splitProperty: DatabaseProperty
  valueColors: Record<string, ColorTokenId>
}) {
  const dataByAxisLabel = new Map<string, DatabaseChartDataItem>()
  const hiddenGroups = new Set(hiddenGroupNames)
  const seriesByLabel = new Map<string, DatabaseChartSeriesItem>()
  const getSeries = (label: string) => {
    const existingSeries = seriesByLabel.get(label)

    if (existingSeries) {
      return existingSeries
    }

    const series = {
      color: getOptionColor(splitProperty, label, valueColors),
      key: getChartSeriesKey(splitProperty, label),
      label,
    }

    seriesByLabel.set(label, series)
    return series
  }

  for (const row of rows) {
    const { isEmpty, label: axisLabel } = getChartLabelState({
      personNamesById,
      property: axisProperty,
      propertyValuesByKey,
      row,
    })

    if (hiddenGroups.has(axisLabel)) {
      continue
    }

    if (omitZeroValues && isEmpty) {
      continue
    }

    const measureValue = getChartMeasureValue(
      row,
      measureProperty,
      propertyValuesByKey,
    )

    if (omitZeroValues && measureValue === 0) {
      continue
    }

    if (
      omitZeroValues &&
      getChartLabelState({
        personNamesById,
        property: splitProperty,
        propertyValuesByKey,
        row,
      }).isEmpty
    ) {
      continue
    }

    const splitLabels = getChartGroupLabels({
      dateInterval,
      personNamesById,
      property: splitProperty,
      propertyValuesByKey,
      row,
    })

    const item =
      dataByAxisLabel.get(axisLabel) ??
      ({
        color: DEFAULT_CHART_COLOR,
        count: 0,
        name: axisLabel,
      } satisfies DatabaseChartDataItem)

    for (const splitLabel of splitLabels) {
      const series = getSeries(splitLabel)
      item[series.key] = Number(item[series.key] ?? 0) + measureValue
      item.count += measureValue
    }

    dataByAxisLabel.set(axisLabel, item)
  }

  const series = Array.from(seriesByLabel.values())
  const data = sortDatabaseChartData(
    Array.from(dataByAxisLabel.values()).filter(
      (item) => !omitZeroValues || item.count > 0,
    ),
    sort,
  )
    .slice(0, 12)
    .map((item) => {
      const nextItem = { ...item }

      for (const seriesItem of series) {
        nextItem[seriesItem.key] = Number(nextItem[seriesItem.key] ?? 0)
      }

      return nextItem
    })

  return { data, series }
}

export function createOuterPieSegments(
  data: DatabaseChartDataItem[],
  series: DatabaseChartSeriesItem[],
): DatabaseChartPieSegment[] {
  return data.flatMap((item) =>
    series
      .map((seriesItem) => ({
        color: seriesItem.color,
        name: `${item.name} / ${seriesItem.label}`,
        value: Number(item[seriesItem.key] ?? 0),
      }))
      .filter((segment) => segment.value > 0),
  )
}
