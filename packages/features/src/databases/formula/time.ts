export type ZonedDateParts = {
  day: number
  hour: number
  millisecond: number
  minute: number
  month: number
  second: number
  year: number
}

export function getRuntimeTimezone(timezone?: string) {
  const candidate =
    timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(0)
    return candidate
  } catch {
    throw new Error(`Invalid IANA timezone: ${candidate}`)
  }
}

export function getZonedDateParts(
  date: Date,
  timezone?: string,
): ZonedDateParts {
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Expected a valid date value.")
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: getRuntimeTimezone(timezone),
    year: "numeric",
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.flatMap((part) =>
      part.type === "literal" ? [] : [[part.type, Number(part.value)]],
    ),
  )

  return {
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    millisecond: date.getUTCMilliseconds(),
    minute: values.minute ?? 0,
    month: values.month ?? 1,
    second: values.second ?? 0,
    year: values.year ?? 1970,
  }
}

function getTimezoneOffset(date: Date, timezone?: string) {
  const parts = getZonedDateParts(date, timezone)
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  )

  return representedAsUtc - date.getTime()
}

export function zonedDatePartsToDate(
  parts: ZonedDateParts,
  timezone?: string,
) {
  const intendedUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  )
  let result = new Date(
    intendedUtc - getTimezoneOffset(new Date(intendedUtc), timezone),
  )
  result = new Date(intendedUtc - getTimezoneOffset(result, timezone))

  return result
}

export function startOfDayInTimezone(date: Date, timezone?: string) {
  return zonedDatePartsToDate(
    {
      ...getZonedDateParts(date, timezone),
      hour: 0,
      millisecond: 0,
      minute: 0,
      second: 0,
    },
    timezone,
  )
}

export function getZonedWeekday(date: Date, timezone?: string) {
  const parts = getZonedDateParts(date, timezone)

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}

export function getZonedIsoWeek(date: Date, timezone?: string) {
  const parts = getZonedDateParts(date, timezone)
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const day = utcDate.getUTCDay() || 7

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))

  return Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  )
}
