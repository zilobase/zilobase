import { parseDatabaseDateValue } from "./database-date-value"

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

export function formatDatabaseDateValue(
  value: string | string[],
  config: unknown
) {
  return formatDatabaseDateValueWithFormats(
    value,
    getDateFormatConfig(config),
    getTimeFormatConfig(config)
  )
}

export function formatDatabaseDateValueWithFormats(
  value: string | string[],
  dateFormat: DateFormatValue,
  timeFormat: TimeFormatValue
) {
  const [startValue, endValue] = Array.isArray(value) ? value : [value, undefined]
  const startDate = startValue ? parseDatabaseDateValue(startValue) : undefined
  const endDate = endValue ? parseDatabaseDateValue(endValue) : undefined
  const startTime = startValue ? getTimeFromValue(startValue) : ""
  const endTime = endValue ? getTimeFromValue(endValue) : ""

  if (startDate && endDate) {
    return `${formatDate(startDate, dateFormat, timeFormat, startTime)} - ${formatDate(
      endDate,
      dateFormat,
      timeFormat,
      endTime
    )}`
  }

  return startDate
    ? formatDate(startDate, dateFormat, timeFormat, startTime)
    : ""
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

function getTimeFromValue(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? ""
}

function formatDate(
  date: Date,
  dateFormat: DateFormatValue,
  timeFormat: TimeFormatValue,
  timeValue: string
) {
  const dateValue = formatDateOnly(date, dateFormat)
  const formattedTimeValue = formatTime(timeValue, timeFormat)

  return formattedTimeValue ? `${dateValue} ${formattedTimeValue}` : dateValue
}

function formatDateOnly(date: Date, dateFormat: DateFormatValue) {
  if (dateFormat === "short") {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date)
  }

  if (dateFormat === "month_day_year") {
    return formatNumericDate(date, [
      date.getMonth() + 1,
      date.getDate(),
      date.getFullYear(),
    ])
  }

  if (dateFormat === "day_month_year") {
    return formatNumericDate(date, [
      date.getDate(),
      date.getMonth() + 1,
      date.getFullYear(),
    ])
  }

  if (dateFormat === "year_month_day") {
    return formatNumericDate(date, [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    ])
  }

  if (dateFormat === "relative") {
    return formatRelativeDate(date)
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function formatTime(value: string, timeFormat: TimeFormatValue) {
  if (timeFormat === "hidden" || !value) {
    return ""
  }

  const [hoursValue, minutesValue] = value.split(":")
  const date = new Date()
  const hours = Number(hoursValue)
  const minutes = Number(minutesValue)

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return ""
  }

  date.setHours(hours, minutes, 0, 0)

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hour12: timeFormat === "12_hour",
    minute: "2-digit",
  }).format(date)
}

function formatNumericDate(date: Date, parts: number[]) {
  return parts
    .map((part, index) =>
      index === 0 && part === date.getFullYear()
        ? String(part)
        : String(part).padStart(2, "0")
    )
    .join("/")
}

function formatRelativeDate(date: Date) {
  const today = new Date()
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.round(
    (dateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (dayDiff === 0) {
    return "Today"
  }

  if (dayDiff === -1) {
    return "Yesterday"
  }

  if (dayDiff === 1) {
    return "Tomorrow"
  }

  return new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  }).format(dayDiff, "day")
}
