export type DateFormatValue =
  | "full"
  | "short"
  | "month_day_year"
  | "day_month_year"
  | "year_month_day"
  | "relative"

export const dateFormatOptions = [
  {
    label: "Full date",
    value: "full",
  },
  {
    label: "Short date",
    value: "short",
  },
  {
    label: "Month/Day/Year",
    value: "month_day_year",
  },
  {
    label: "Day/Month/Year",
    value: "day_month_year",
  },
  {
    label: "Year/Month/Day",
    value: "year_month_day",
  },
  {
    label: "Relative",
    value: "relative",
  },
] satisfies {
  label: string
  value: DateFormatValue
}[]

export type TimeFormatValue = "hidden" | "12_hour" | "24_hour"

export const timeFormatOptions = [
  {
    label: "Hidden",
    value: "hidden",
  },
  {
    label: "12 hour",
    value: "12_hour",
  },
  {
    label: "24 hour",
    value: "24_hour",
  },
] satisfies {
  label: string
  value: TimeFormatValue
}[]

export type DatabaseDatePropertyConfig = {
  dateFormat?: DateFormatValue
  timeFormat?: TimeFormatValue
}

export function getDateFormatConfig(config: unknown): DateFormatValue {
  if (!config || typeof config !== "object" || !("dateFormat" in config)) {
    return "full"
  }

  const dateFormat = (config as DatabaseDatePropertyConfig).dateFormat

  return isDateFormatValue(dateFormat) ? dateFormat : "full"
}

export function getDateFormatLabel(value: DateFormatValue) {
  return (
    dateFormatOptions.find((option) => option.value === value)?.label ??
    dateFormatOptions[0].label
  )
}

export function getTimeFormatConfig(config: unknown): TimeFormatValue {
  if (!config || typeof config !== "object" || !("timeFormat" in config)) {
    return "hidden"
  }

  const timeFormat = (config as DatabaseDatePropertyConfig).timeFormat

  return isTimeFormatValue(timeFormat) ? timeFormat : "hidden"
}

export function getTimeFormatLabel(value: TimeFormatValue) {
  return (
    timeFormatOptions.find((option) => option.value === value)?.label ??
    timeFormatOptions[0].label
  )
}

function isDateFormatValue(value: unknown): value is DateFormatValue {
  return (
    value === "full" ||
    value === "short" ||
    value === "month_day_year" ||
    value === "day_month_year" ||
    value === "year_month_day" ||
    value === "relative"
  )
}

function isTimeFormatValue(value: unknown): value is TimeFormatValue {
  return value === "hidden" || value === "12_hour" || value === "24_hour"
}
