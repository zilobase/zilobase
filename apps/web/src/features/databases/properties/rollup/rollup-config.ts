import type {
  DatabaseNumberDisplayStyle,
  DatabaseRollupCalculation,
  NumberDecimalPlacesValue,
} from "../../views/database-view-config"

export type DatabaseRollupConfig = {
  calculation?: DatabaseRollupCalculation
  numberDisplayColor: string
  numberDisplayDivideBy: number
  numberDisplayShowNumber: boolean
  numberDisplayStyle: DatabaseNumberDisplayStyle
  numberDecimalPlaces: NumberDecimalPlacesValue
  numberFormat: string
  relationPropertyId?: string
  targetPropertyId?: string
}

const DEFAULT_ROLLUP_CONFIG = {
  numberDisplayColor: "green",
  numberDisplayDivideBy: 100,
  numberDisplayShowNumber: true,
  numberDisplayStyle: "number",
  numberDecimalPlaces: "default",
  numberFormat: "number",
} satisfies DatabaseRollupConfig

export const rollupShowCalculations = [
  { label: "Show original", value: "show_original" },
  { label: "Show unique values", value: "show_unique" },
] satisfies { label: string; value: DatabaseRollupCalculation }[]

export const rollupCountCalculations = [
  { label: "Count all", value: "count_all" },
  { label: "Count values", value: "count_values" },
  { label: "Count unique values", value: "count_unique" },
  { label: "Count empty", value: "count_empty" },
  { label: "Count not empty", value: "count_not_empty" },
] satisfies { label: string; value: DatabaseRollupCalculation }[]

export const rollupPercentCalculations = [
  { label: "Percent empty", value: "percent_empty" },
  { label: "Percent not empty", value: "percent_not_empty" },
] satisfies { label: string; value: DatabaseRollupCalculation }[]

export const rollupGeneralCalculations = [
  ...rollupShowCalculations,
  ...rollupCountCalculations,
  ...rollupPercentCalculations,
] satisfies { label: string; value: DatabaseRollupCalculation }[]

export const rollupNumberCalculations = [
  { label: "Sum", value: "sum" },
  { label: "Average", value: "average" },
  { label: "Median", value: "median" },
  { label: "Min", value: "min" },
  { label: "Max", value: "max" },
  { label: "Range", value: "range" },
] satisfies { label: string; value: DatabaseRollupCalculation }[]

export const rollupDateCalculations = [
  { label: "Earliest date", value: "earliest_date" },
  { label: "Latest date", value: "latest_date" },
  { label: "Date range", value: "date_range" },
] satisfies { label: string; value: DatabaseRollupCalculation }[]

export function getRollupConfig(config: unknown): DatabaseRollupConfig {
  const rollup =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as { rollup?: unknown }).rollup
      : null

  if (!rollup || typeof rollup !== "object" || Array.isArray(rollup)) {
    return DEFAULT_ROLLUP_CONFIG
  }

  const parsed = rollup as {
    calculation?: unknown
    numberDisplayColor?: unknown
    numberDisplayDivideBy?: unknown
    numberDisplayShowNumber?: unknown
    numberDisplayStyle?: unknown
    numberDecimalPlaces?: unknown
    numberFormat?: unknown
    relationPropertyId?: unknown
    targetPropertyId?: unknown
  }

  return {
    calculation: isRollupCalculation(parsed.calculation)
      ? parsed.calculation
      : undefined,
    numberDisplayColor:
      typeof parsed.numberDisplayColor === "string" &&
      parsed.numberDisplayColor.length > 0
        ? parsed.numberDisplayColor
        : DEFAULT_ROLLUP_CONFIG.numberDisplayColor,
    numberDisplayDivideBy:
      typeof parsed.numberDisplayDivideBy === "number" &&
      Number.isFinite(parsed.numberDisplayDivideBy) &&
      parsed.numberDisplayDivideBy > 0
        ? parsed.numberDisplayDivideBy
        : DEFAULT_ROLLUP_CONFIG.numberDisplayDivideBy,
    numberDisplayShowNumber:
      typeof parsed.numberDisplayShowNumber === "boolean"
        ? parsed.numberDisplayShowNumber
        : DEFAULT_ROLLUP_CONFIG.numberDisplayShowNumber,
    numberDisplayStyle: isDatabaseNumberDisplayStyle(parsed.numberDisplayStyle)
      ? parsed.numberDisplayStyle
      : DEFAULT_ROLLUP_CONFIG.numberDisplayStyle,
    numberDecimalPlaces: isNumberDecimalPlacesValue(parsed.numberDecimalPlaces)
      ? parsed.numberDecimalPlaces
      : DEFAULT_ROLLUP_CONFIG.numberDecimalPlaces,
    numberFormat:
      typeof parsed.numberFormat === "string" && parsed.numberFormat.trim()
        ? parsed.numberFormat
        : DEFAULT_ROLLUP_CONFIG.numberFormat,
    relationPropertyId:
      typeof parsed.relationPropertyId === "string"
        ? parsed.relationPropertyId
        : undefined,
    targetPropertyId:
      typeof parsed.targetPropertyId === "string"
        ? parsed.targetPropertyId
        : undefined,
  }
}

export function getRollupNumberPropertyConfig(config: unknown) {
  const rollup = getRollupConfig(config)

  return {
    numberDecimalPlaces: rollup.numberDecimalPlaces,
    numberDisplayColor: rollup.numberDisplayColor,
    numberDisplayDivideBy: rollup.numberDisplayDivideBy,
    numberDisplayShowNumber: rollup.numberDisplayShowNumber,
    numberDisplayStyle: rollup.numberDisplayStyle,
    numberFormat: rollup.numberFormat,
  }
}

export function getRollupConfigUpdate(
  config: unknown,
  defaults: Partial<DatabaseRollupConfig>,
  patch: Partial<DatabaseRollupConfig>
) {
  return {
    rollup: {
      ...getRollupConfig(config),
      ...defaults,
      ...patch,
    },
  }
}

export function getRollupCalculationsForType(type: string) {
  if (type === "number") {
    return [...rollupGeneralCalculations, ...rollupNumberCalculations]
  }

  if (type === "date" || type === "created_time" || type === "edited_time") {
    return [...rollupGeneralCalculations, ...rollupDateCalculations]
  }

  return rollupGeneralCalculations
}

export function getValidRollupCalculation(
  calculation: DatabaseRollupCalculation | undefined,
  type: string
) {
  const options = getRollupCalculationsForType(type)

  return options.some((option) => option.value === calculation)
    ? calculation!
    : options[0]?.value ?? "show_original"
}

function isRollupCalculation(
  value: unknown
): value is DatabaseRollupCalculation {
  return [
    ...rollupGeneralCalculations,
    ...rollupNumberCalculations,
    ...rollupDateCalculations,
  ].some((option) => option.value === value)
}

function isNumberDecimalPlacesValue(
  value: unknown
): value is NumberDecimalPlacesValue {
  return value === "default" || [0, 1, 2, 3, 4, 5].includes(value as number)
}

function isDatabaseNumberDisplayStyle(
  value: unknown
): value is DatabaseNumberDisplayStyle {
  return value === "number" || value === "bar" || value === "ring"
}
