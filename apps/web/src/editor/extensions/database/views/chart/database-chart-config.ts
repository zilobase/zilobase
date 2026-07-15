import type { ColorTokenId } from "@/lib/color-tokens"

export type DatabaseChartType =
  | "bar"
  | "horizontal-bar"
  | "line"
  | "pie"
  | "radar"
  | "radial"
  | "count"

export type DatabaseChartColor = "auto" | ColorTokenId
export type DatabaseChartSort =
  | "manual"
  | "axis-asc"
  | "axis-desc"
  | "value-asc"
  | "value-desc"
export type DatabaseChartDateInterval =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
export type DatabaseChartReferenceLine = {
  color: "black" | ColorTokenId
  id: string
  label: string
  style: "solid" | "dashed" | "dotted"
  value: number
}

export type DatabaseChartSettings = {
  color: DatabaseChartColor
  groupByPropertyId?: string
  hiddenGroupNames?: string[]
  measurePropertyId?: string
  omitZeroValues: boolean
  rangeMax?: number
  rangeMin?: number
  referenceLines?: DatabaseChartReferenceLine[]
  sort?: DatabaseChartSort
  splitByDateInterval?: DatabaseChartDateInterval
  splitByPropertyId?: string
  type: DatabaseChartType
  valueColors: Record<string, ColorTokenId>
}

export const databaseChartTypes: DatabaseChartType[] = [
  "bar",
  "horizontal-bar",
  "line",
  "pie",
  "radar",
  "radial",
  "count",
]

const chartColors: DatabaseChartColor[] = [
  "auto",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
]

const valueColors = new Set(chartColors.filter((color) => color !== "auto"))
const chartSorts = new Set<DatabaseChartSort>([
  "manual",
  "axis-asc",
  "axis-desc",
  "value-asc",
  "value-desc",
])
const chartDateIntervals = new Set<DatabaseChartDateInterval>([
  "day",
  "week",
  "month",
  "quarter",
  "year",
])
const referenceLineStyles = new Set<DatabaseChartReferenceLine["style"]>([
  "solid",
  "dashed",
  "dotted",
])
const referenceLineColors = new Set<DatabaseChartReferenceLine["color"]>([
  "black",
  ...valueColors,
])

export const defaultDatabaseChartSettings: DatabaseChartSettings = {
  color: "auto",
  omitZeroValues: false,
  type: "bar",
  valueColors: {},
}

export function shouldSplitDatabaseChartSeries({
  axisPropertyId,
  splitPropertyId,
  type,
}: {
  axisPropertyId?: string
  splitPropertyId?: string
  type: DatabaseChartType
}) {
  return (
    Boolean(splitPropertyId) &&
    axisPropertyId !== splitPropertyId &&
    type !== "count" &&
    type !== "radial"
  )
}

export function getDatabaseChartSettings(config: unknown): DatabaseChartSettings {
  const chart =
    config && typeof config === "object" && !Array.isArray(config) && "chart" in config
      ? (config as { chart?: unknown }).chart
      : undefined

  if (!chart || typeof chart !== "object" || Array.isArray(chart)) {
    return defaultDatabaseChartSettings
  }

  const record = chart as Record<string, unknown>
  const type = databaseChartTypes.includes(record.type as DatabaseChartType)
    ? (record.type as DatabaseChartType)
    : defaultDatabaseChartSettings.type
  const color = chartColors.includes(record.color as DatabaseChartColor)
    ? (record.color as DatabaseChartColor)
    : defaultDatabaseChartSettings.color
  const storedValueColors =
    record.valueColors &&
    typeof record.valueColors === "object" &&
    !Array.isArray(record.valueColors)
      ? Object.fromEntries(
          Object.entries(record.valueColors).filter(
            (entry): entry is [string, ColorTokenId] =>
              typeof entry[1] === "string" && valueColors.has(entry[1] as ColorTokenId),
          ),
        )
      : {}
  const referenceLines = Array.isArray(record.referenceLines)
    ? record.referenceLines.flatMap((line, index) => {
        if (!line || typeof line !== "object" || Array.isArray(line)) {
          return []
        }

        const item = line as Record<string, unknown>

        if (typeof item.value !== "number" || !Number.isFinite(item.value)) {
          return []
        }

        return [
          {
            color: referenceLineColors.has(
              item.color as DatabaseChartReferenceLine["color"],
            )
              ? (item.color as DatabaseChartReferenceLine["color"])
              : "black",
            id:
              typeof item.id === "string" && item.id
                ? item.id
                : `reference-${index}`,
            label: typeof item.label === "string" ? item.label : "",
            style: referenceLineStyles.has(
              item.style as DatabaseChartReferenceLine["style"],
            )
              ? (item.style as DatabaseChartReferenceLine["style"])
              : "dashed",
            value: item.value,
          },
        ]
      })
    : []
  const rangeMin = getFiniteNumber(record.rangeMin)
  const rangeMax = getFiniteNumber(record.rangeMax)

  return {
    color,
    ...(typeof record.groupByPropertyId === "string" && record.groupByPropertyId
      ? { groupByPropertyId: record.groupByPropertyId }
      : {}),
    ...(Array.isArray(record.hiddenGroupNames)
      ? {
          hiddenGroupNames: record.hiddenGroupNames.filter(
            (name): name is string => typeof name === "string" && Boolean(name),
          ),
        }
      : {}),
    ...(typeof record.measurePropertyId === "string" && record.measurePropertyId
      ? { measurePropertyId: record.measurePropertyId }
      : {}),
    omitZeroValues: record.omitZeroValues === true,
    ...(rangeMax !== undefined ? { rangeMax } : {}),
    ...(rangeMin !== undefined ? { rangeMin } : {}),
    ...(referenceLines.length > 0 ? { referenceLines } : {}),
    ...(chartSorts.has(record.sort as DatabaseChartSort)
      ? { sort: record.sort as DatabaseChartSort }
      : {}),
    ...(chartDateIntervals.has(
      record.splitByDateInterval as DatabaseChartDateInterval,
    )
      ? {
          splitByDateInterval:
            record.splitByDateInterval as DatabaseChartDateInterval,
        }
      : {}),
    ...(typeof record.splitByPropertyId === "string" &&
    record.splitByPropertyId
      ? { splitByPropertyId: record.splitByPropertyId }
      : {}),
    type,
    valueColors: storedValueColors,
  }
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined
}
