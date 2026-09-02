import type { DatabaseAutomationSchedule } from "./contracts"

type LocalDate = { day: number; month: number; year: number }

const DAY_MS = 86_400_000
const MINUTE_MS = 60_000
const formatters = new Map<string, Intl.DateTimeFormat>()

export function getNextDatabaseAutomationOccurrence(
  schedule: DatabaseAutomationSchedule,
  after: Date,
): Date | null {
  return occurrencesAround(schedule, after).find((candidate) => candidate > after) ?? null
}

export function getLatestDatabaseAutomationOccurrence(
  schedule: DatabaseAutomationSchedule,
  atOrBefore: Date,
): Date | null {
  const candidates = occurrencesAround(schedule, atOrBefore)
  return candidates.filter((candidate) => candidate <= atOrBefore).at(-1) ?? null
}

export function resolveDatabaseAutomationLocalTime(
  date: string,
  localTime: string,
  timezone: string,
): Date {
  const local = parseDate(date)
  const [hour, minute] = localTime.split(":").map(Number) as [number, number]
  const intended = Date.UTC(local.year, local.month - 1, local.day, hour, minute)
  const offsets = new Set<number>()
  for (const delta of [-DAY_MS, 0, DAY_MS]) {
    const instant = new Date(intended + delta)
    const parts = zonedParts(instant, timezone)
    offsets.add(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant.getTime())
  }
  const exact = [...offsets]
    .map((offset) => new Date(intended - offset))
    .filter((instant) => sameLocal(zonedParts(instant, timezone), { ...local, hour, minute }))
    .sort((left, right) => left.getTime() - right.getTime())
  if (exact[0]) return exact[0]

  // During a spring-forward gap, use the first valid local minute after the gap.
  const center = new Date(intended - ([...offsets][0] ?? 0))
  for (let delta = -180; delta <= 180; delta += 1) {
    const instant = new Date(center.getTime() + delta * MINUTE_MS)
    const parts = zonedParts(instant, timezone)
    if (
      parts.year === local.year &&
      parts.month === local.month &&
      parts.day === local.day &&
      compareLocal(parts, { ...local, hour, minute }) >= 0
    ) return instant
  }
  throw new RangeError(`Could not resolve ${date} ${localTime} in ${timezone}`)
}

function occurrencesAround(schedule: DatabaseAutomationSchedule, instant: Date) {
  const start = parseDate(schedule.startDate)
  const localInstant = zonedParts(instant, schedule.timezone)
  const target = { day: localInstant.day, month: localInstant.month, year: localInstant.year }
  const frequency = customFrequency(schedule)
  const period = periodIndex(frequency, start, target)
  const alignedPeriod = Math.floor(Math.max(0, period) / schedule.interval) * schedule.interval
  const candidates: Date[] = []
  for (const index of [
    Math.max(0, alignedPeriod - schedule.interval),
    alignedPeriod,
    alignedPeriod + schedule.interval,
    alignedPeriod + schedule.interval * 2,
  ]) {
    for (const date of datesForPeriod(schedule, frequency, start, index)) {
      const serialized = formatDate(date)
      if (serialized < schedule.startDate || (schedule.endDate && serialized > schedule.endDate)) continue
      candidates.push(resolveDatabaseAutomationLocalTime(serialized, schedule.localTime, schedule.timezone))
    }
  }
  return [...new Map(candidates.map((candidate) => [candidate.getTime(), candidate])).values()]
    .sort((left, right) => left.getTime() - right.getTime())
}

function customFrequency(schedule: DatabaseAutomationSchedule) {
  if (schedule.frequency !== "custom") return schedule.frequency
  if (schedule.months?.length) return "yearly" as const
  if (schedule.dayOfMonth !== undefined) return "monthly" as const
  if (schedule.weekdays?.length) return "weekly" as const
  return "daily" as const
}

function periodIndex(
  frequency: "daily" | "monthly" | "weekly" | "yearly",
  start: LocalDate,
  target: LocalDate,
) {
  if (frequency === "daily") return Math.floor(daysBetween(start, target))
  if (frequency === "weekly") return Math.floor(daysBetween(startOfWeek(start), startOfWeek(target)) / 7)
  if (frequency === "monthly") return (target.year - start.year) * 12 + target.month - start.month
  return target.year - start.year
}

function datesForPeriod(
  schedule: DatabaseAutomationSchedule,
  frequency: "daily" | "monthly" | "weekly" | "yearly",
  start: LocalDate,
  period: number,
): LocalDate[] {
  if (period % schedule.interval !== 0) return []
  if (frequency === "daily") return [addDays(start, period)]
  if (frequency === "weekly") {
    const week = addDays(startOfWeek(start), period * 7)
    const weekdays = schedule.weekdays?.length ? [...new Set(schedule.weekdays)].sort((a, b) => a - b) : [weekday(start)]
    return weekdays.map((day) => addDays(week, day))
  }
  if (frequency === "monthly") {
    const month = addMonths({ ...start, day: 1 }, period)
    return [{ ...month, day: scheduledDay(schedule.dayOfMonth ?? start.day, month) }]
  }
  const year = start.year + period
  const months = schedule.months?.length ? [...new Set(schedule.months)].sort((a, b) => a - b) : [start.month]
  return months.map((month) => {
    const local = { day: 1, month, year }
    return { ...local, day: scheduledDay(schedule.dayOfMonth ?? start.day, local) }
  })
}

function scheduledDay(day: number | "last", date: Pick<LocalDate, "month" | "year">) {
  const last = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate()
  return day === "last" ? last : Math.min(day, last)
}

function parseDate(value: string): LocalDate {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number]
  return { day, month, year }
}

function formatDate(date: LocalDate) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`
}

function addDays(date: LocalDate, amount: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + amount))
  return { day: next.getUTCDate(), month: next.getUTCMonth() + 1, year: next.getUTCFullYear() }
}

function addMonths(date: LocalDate, amount: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1 + amount, 1))
  return { day: date.day, month: next.getUTCMonth() + 1, year: next.getUTCFullYear() }
}

function daysBetween(left: LocalDate, right: LocalDate) {
  return (Date.UTC(right.year, right.month - 1, right.day) - Date.UTC(left.year, left.month - 1, left.day)) / DAY_MS
}

function weekday(date: LocalDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
}

function startOfWeek(date: LocalDate) {
  return addDays(date, -weekday(date))
}

function zonedParts(instant: Date, timezone: string) {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    })
    formatters.set(timezone, formatter)
  }
  const values = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]))
  return {
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    month: Number(values.month),
    year: Number(values.year),
  }
}

function sameLocal(
  left: ReturnType<typeof zonedParts>,
  right: LocalDate & { hour: number; minute: number },
) {
  return compareLocal(left, right) === 0
}

function compareLocal(
  left: ReturnType<typeof zonedParts>,
  right: LocalDate & { hour: number; minute: number },
) {
  return Date.UTC(left.year, left.month - 1, left.day, left.hour, left.minute) -
    Date.UTC(right.year, right.month - 1, right.day, right.hour, right.minute)
}
