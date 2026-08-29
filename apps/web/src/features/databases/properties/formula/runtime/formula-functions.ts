import type { DatabasePropertyValue } from "../../../core/utils"
import { formatFormulaValue } from "../formatting/formula-formatters"
import type { FormulaValue } from "../model/formula-types"

export function callEagerFormulaFunction(name: string, args: FormulaValue[]) {
  switch (name) {
    case "abs":
      return Math.abs(requireNumber(args[0]))
    case "add":
      return requireNumber(args[0]) + requireNumber(args[1])
    case "and":
      return args.every(isTruthy)
    case "at":
      return valueAtIndex(args[0], requireNumber(args[1]))
    case "cbrt":
      return Math.cbrt(requireNumber(args[0]))
    case "ceil":
      return Math.ceil(requireNumber(args[0]))
    case "concat":
      return args.flatMap(listValue)
    case "contains":
      return formulaContains(args[0], args[1])
    case "date":
      return requireDate(args[0]).getDate()
    case "dateadd":
      return addDate(args[0], requireNumber(args[1]), textValue(args[2]))
    case "datebetween":
      return dateBetween(args[0], args[1], textValue(args[2]))
    case "dateend":
      return Array.isArray(args[0]) ? args[0][1] ?? args[0][0] ?? null : args[0]
    case "daterange":
      return [normalizeDate(args[0]), normalizeDate(args[1])].filter(
        (date): date is Date => date instanceof Date
      )
    case "datestart":
      return Array.isArray(args[0]) ? args[0][0] ?? null : args[0]
    case "datesubtract":
      return addDate(args[0], requireNumber(args[1]) * -1, textValue(args[2]))
    case "day":
      return notionDay(requireDate(args[0]))
    case "divide":
      return requireNumber(args[0]) / requireNumber(args[1])
    case "e":
      return Math.E
    case "email":
      return personTextValue(args[0])
    case "empty":
      return isEmptyFormulaValue(args[0])
    case "equal":
      return areFormulaValuesEqual(args[0], args[1])
    case "exp":
      return Math.exp(requireNumber(args[0]))
    case "first":
      return valueAtIndex(args[0], 0)
    case "flat":
      return flattenList(listValue(args[0]))
    case "floor":
      return Math.floor(requireNumber(args[0]))
    case "format":
      return formatFormulaValue(args[0])
    case "formatdate":
      return formatFormulaDate(args[0], textValue(args[1]))
    case "formatnumber":
      return formatFormulaNumber(args[0], args[1], args[2])
    case "fromtimestamp": {
      const date = new Date(requireNumber(args[0]))

      date.setSeconds(0, 0)

      return Number.isFinite(date.getTime()) ? date : null
    }
    case "hour":
      return requireDate(args[0]).getHours()
    case "includes":
      return formulaContains(args[0], args[1])
    case "join":
      return listValue(args[0]).map(formatFormulaValue).join(textValue(args[1]))
    case "last":
      return valueAtIndex(args[0], -1)
    case "length":
      return getFormulaLength(args[0])
    case "link":
      return textValue(args[0])
    case "ln":
      return Math.log(requireNumber(args[0]))
    case "log10":
      return Math.log10(requireNumber(args[0]))
    case "log2":
      return Math.log2(requireNumber(args[0]))
    case "lower":
      return textValue(args[0]).toLowerCase()
    case "match":
      return regexMatches(args[0], args[1])
    case "max":
      return Math.max(...flattenNumbers(args))
    case "mean": {
      const numbers = flattenNumbers(args)

      return numbers.length
        ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
        : null
    }
    case "median":
      return median(args)
    case "min":
      return Math.min(...flattenNumbers(args))
    case "minute":
      return requireDate(args[0]).getMinutes()
    case "mod":
      return requireNumber(args[0]) % requireNumber(args[1])
    case "month":
      return requireDate(args[0]).getMonth() + 1
    case "multiply":
      return requireNumber(args[0]) * requireNumber(args[1])
    case "name":
      return personTextValue(args[0])
    case "not":
      return !isTruthy(args[0])
    case "now":
      return new Date()
    case "or":
      return args.some(isTruthy)
    case "parsedate":
      return normalizeDate(args[0])
    case "pi":
      return Math.PI
    case "pow":
      return requireNumber(args[0]) ** requireNumber(args[1])
    case "replace":
      return replaceWithRegex(args[0], args[1], args[2], false)
    case "replaceall":
      return replaceWithRegex(args[0], args[1], args[2], true)
    case "repeat":
      return textValue(args[0]).repeat(Math.max(0, Math.trunc(requireNumber(args[1]))))
    case "reverse":
      return [...listValue(args[0])].reverse()
    case "round":
      return roundNumber(args[0], args[1])
    case "sign":
      return Math.sign(requireNumber(args[0]))
    case "slice":
      return sliceFormulaValue(args[0], args[1], args[2])
    case "sort":
      return [...listValue(args[0])].sort(compareListItems)
    case "split":
      return textValue(args[0]).split(textValue(args[1]))
    case "sqrt":
      return Math.sqrt(requireNumber(args[0]))
    case "style":
      return textValue(args[0])
    case "substring":
      return textValue(args[0]).slice(
        requireNumber(args[1]),
        args[2] === undefined ? undefined : requireNumber(args[2])
      )
    case "subtract":
      return requireNumber(args[0]) - requireNumber(args[1])
    case "sum":
      return flattenNumbers(args).reduce((sum, value) => sum + value, 0)
    case "test":
      return regexTest(args[0], args[1])
    case "timestamp":
      return requireDate(args[0]).getTime()
    case "today": {
      const date = new Date()

      date.setHours(0, 0, 0, 0)

      return date
    }
    case "tonumber":
      return numberValue(args[0])
    case "trim":
      return textValue(args[0]).trim()
    case "unequal":
      return !areFormulaValuesEqual(args[0], args[1])
    case "unique":
      return uniqueFormulaList(listValue(args[0]))
    case "unstyle":
      return textValue(args[0])
    case "upper":
      return textValue(args[0]).toUpperCase()
    case "week":
      return isoWeek(requireDate(args[0]))
    case "year":
      return requireDate(args[0]).getFullYear()
    default:
      throw new Error(`Unknown function: ${name}()`)
  }
}


export function normalizePropertyName(name: string) {
  return name.trim().toLowerCase()
}

export function addFormulaValues(left: FormulaValue, right: FormulaValue) {
  const leftNumber = numberValue(left)
  const rightNumber = numberValue(right)

  if (
    leftNumber !== null &&
    rightNumber !== null &&
    typeof left !== "string" &&
    typeof right !== "string"
  ) {
    return leftNumber + rightNumber
  }

  return textValue(left) + textValue(right)
}

export function compareFormulaValues(
  left: FormulaValue,
  right: FormulaValue,
  operator: string
) {
  const leftComparable = comparableValue(left)
  const rightComparable = comparableValue(right)
  const comparison =
    typeof leftComparable === "number" && typeof rightComparable === "number"
      ? leftComparable - rightComparable
      : String(leftComparable).localeCompare(String(rightComparable), undefined, {
          numeric: true,
          sensitivity: "base",
        })

  if (operator === ">") {
    return comparison > 0
  }

  if (operator === ">=") {
    return comparison >= 0
  }

  if (operator === "<") {
    return comparison < 0
  }

  return comparison <= 0
}

export function areFormulaValuesEqual(left: FormulaValue, right: FormulaValue) {
  const leftComparable = comparableValue(left)
  const rightComparable = comparableValue(right)

  return leftComparable === rightComparable
}

function comparableValue(value: FormulaValue): number | string {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === "number") {
    return value
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0
  }

  if (Array.isArray(value)) {
    return value.map(formatFormulaValue).join(", ")
  }

  return formatFormulaValue(value)
}

export function isTruthy(value: FormulaValue) {
  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
  }

  if (typeof value === "number") {
    return value !== 0 && Number.isFinite(value)
  }

  if (typeof value === "boolean") {
    return value
  }

  return Boolean(value)
}

export function isEmptyFormulaValue(value: FormulaValue | undefined) {
  if (value === undefined || value === null || value === "") {
    return true
  }

  if (typeof value === "number") {
    return value === 0
  }

  if (Array.isArray(value)) {
    return value.length === 0
  }

  return false
}

export function getFormulaLength(value: FormulaValue | undefined) {
  if (Array.isArray(value) || typeof value === "string") {
    return value.length
  }

  return formatFormulaValue(value ?? null).length
}

export function formulaContains(value: FormulaValue, search: FormulaValue) {
  if (Array.isArray(value)) {
    return value.some((item) => areFormulaValuesEqual(item, search))
  }

  return textValue(value).includes(textValue(search))
}

export function listValue(value: FormulaValue | undefined): FormulaValue[] {
  if (Array.isArray(value)) {
    return value
  }

  if (value === undefined || value === null || value === "") {
    return []
  }

  return [value]
}

export function flattenList(values: FormulaValue[]): FormulaValue[] {
  return values.flatMap((value) =>
    Array.isArray(value) ? flattenList(value) : [value]
  )
}

export function uniqueFormulaList(values: FormulaValue[]) {
  return values.filter(
    (value, index) =>
      values.findIndex((candidate) => areFormulaValuesEqual(candidate, value)) ===
      index
  )
}

export function compareListItems(left: FormulaValue, right: FormulaValue) {
  const leftComparable = comparableValue(left)
  const rightComparable = comparableValue(right)

  if (typeof leftComparable === "number" && typeof rightComparable === "number") {
    return leftComparable - rightComparable
  }

  return String(leftComparable).localeCompare(String(rightComparable), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

export function sliceFormulaValue(
  value: FormulaValue,
  start: FormulaValue | undefined,
  end: FormulaValue | undefined
) {
  const startIndex = Math.trunc(requireNumber(start))
  const endIndex = end === undefined ? undefined : Math.trunc(requireNumber(end))

  if (typeof value === "string") {
    return value.slice(startIndex, endIndex)
  }

  return listValue(value).slice(startIndex, endIndex)
}

export function personTextValue(value: FormulaValue | undefined) {
  return Array.isArray(value)
    ? formatFormulaValue(value[0] ?? null)
    : formatFormulaValue(value ?? null)
}

export function textValue(value: FormulaValue | undefined) {
  return formatFormulaValue(value ?? null)
}

export function numberValue(value: FormulaValue | DatabasePropertyValue): number | null {
  if (Array.isArray(value)) {
    return numberValue(value[0] ?? null)
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return null
    }

    const nextValue = Number(trimmedValue)

    return Number.isFinite(nextValue) ? nextValue : null
  }

  return null
}

export function requireNumber(value: FormulaValue | undefined): number {
  const nextValue = numberValue(value ?? null)

  if (nextValue === null) {
    throw new Error(`Expected a number, received ${formatFormulaValue(value ?? null) || "empty"}.`)
  }

  return nextValue
}

function flattenNumbers(values: FormulaValue[]): number[] {
  const numbers: number[] = values.flatMap((value) =>
    Array.isArray(value) ? flattenNumbers(value) : [requireNumber(value)]
  )

  if (numbers.length === 0) {
    throw new Error("Expected at least one number.")
  }

  return numbers
}

function median(values: FormulaValue[]): number | null {
  const numbers = flattenNumbers(values).sort((left, right) => left - right)
  const midpoint = Math.floor(numbers.length / 2)

  return numbers.length % 2 === 0
    ? ((numbers[midpoint - 1] ?? 0) + (numbers[midpoint] ?? 0)) / 2
    : numbers[midpoint] ?? null
}

function roundNumber(value: FormulaValue | undefined, places: FormulaValue | undefined) {
  const number = requireNumber(value)
  const decimalPlaces = places === undefined ? 0 : requireNumber(places)
  const multiplier = 10 ** decimalPlaces

  return Math.round(number * multiplier) / multiplier
}

export function formatFormulaNumber(
  value: FormulaValue | undefined,
  format: FormulaValue | undefined,
  decimalPlaces: FormulaValue | undefined
) {
  const number = requireNumber(value)
  const normalizedFormat = textValue(format).trim().toLowerCase()
  const digits =
    decimalPlaces === undefined
      ? undefined
      : Math.max(0, Math.trunc(requireNumber(decimalPlaces)))
  const options: Intl.NumberFormatOptions = {}
  const currency = getCurrencyCode(normalizedFormat)

  if (digits !== undefined) {
    options.minimumFractionDigits = digits
    options.maximumFractionDigits = digits
  }

  if (normalizedFormat === "percent" || normalizedFormat === "%") {
    options.style = "percent"
  } else if (currency) {
    options.currency = currency
    options.style = "currency"
  }

  return new Intl.NumberFormat(undefined, options).format(number)
}

function getCurrencyCode(format: string) {
  const normalizedFormat = format.toUpperCase()
  const currencyAliases: Record<string, string> = {
    DOLLAR: "USD",
    DOLLARS: "USD",
    EURO: "EUR",
    EUROS: "EUR",
    POUND: "GBP",
    POUNDS: "GBP",
    RUPEE: "INR",
    RUPEES: "INR",
    YEN: "JPY",
  }

  if (/^[A-Z]{3}$/.test(normalizedFormat)) {
    return normalizedFormat
  }

  return currencyAliases[normalizedFormat] ?? null
}

export function formatFormulaDate(
  value: FormulaValue | undefined,
  format: string
) {
  const date = requireDate(value)
  const trimmedFormat = format.trim()

  if (!trimmedFormat) {
    return formatFormulaValue(date)
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  const shortMonthNames = monthNames.map((month) => month.slice(0, 3))
  const hours = date.getHours()
  const twelveHour = hours % 12 || 12
  const replacements: Record<string, string> = {
    A: hours >= 12 ? "PM" : "AM",
    a: hours >= 12 ? "pm" : "am",
    D: String(date.getDate()),
    DD: padDatePart(date.getDate()),
    H: String(hours),
    HH: padDatePart(hours),
    h: String(twelveHour),
    hh: padDatePart(twelveHour),
    M: String(date.getMonth() + 1),
    MM: padDatePart(date.getMonth() + 1),
    MMM: shortMonthNames[date.getMonth()] ?? "",
    MMMM: monthNames[date.getMonth()] ?? "",
    mm: padDatePart(date.getMinutes()),
    ss: padDatePart(date.getSeconds()),
    Y: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    YYYY: String(date.getFullYear()),
  }

  return trimmedFormat.replace(
    /YYYY|MMMM|MMM|YY|MM|DD|HH|hh|mm|ss|Y|M|D|H|h|A|a/g,
    (token) => replacements[token] ?? token
  )
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0")
}

export function normalizeDate(value: FormulaValue | DatabasePropertyValue): Date | null {
  if (Array.isArray(value)) {
    return normalizeDate(value[0] ?? null)
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }

  if (typeof value === "number") {
    const date = new Date(value)

    return Number.isFinite(date.getTime()) ? date : null
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value)

    return Number.isFinite(date.getTime()) ? date : null
  }

  return null
}

export function requireDate(value: FormulaValue | undefined) {
  const date = normalizeDate(value ?? null)

  if (!date) {
    throw new Error("Expected a date value.")
  }

  return date
}

function addDate(value: FormulaValue, amount: number, unit: string) {
  const date = new Date(requireDate(value))
  const normalizedUnit = unit.toLowerCase()

  if (normalizedUnit.startsWith("year")) {
    date.setFullYear(date.getFullYear() + amount)
  } else if (normalizedUnit.startsWith("quarter")) {
    date.setMonth(date.getMonth() + amount * 3)
  } else if (normalizedUnit.startsWith("month")) {
    date.setMonth(date.getMonth() + amount)
  } else if (normalizedUnit.startsWith("week")) {
    date.setDate(date.getDate() + amount * 7)
  } else if (normalizedUnit.startsWith("day")) {
    date.setDate(date.getDate() + amount)
  } else if (normalizedUnit.startsWith("hour")) {
    date.setHours(date.getHours() + amount)
  } else if (normalizedUnit.startsWith("minute")) {
    date.setMinutes(date.getMinutes() + amount)
  } else {
    throw new Error(`Unknown date unit: ${unit}`)
  }

  return date
}

function dateBetween(left: FormulaValue, right: FormulaValue, unit: string) {
  const diff = requireDate(left).getTime() - requireDate(right).getTime()
  const normalizedUnit = unit.toLowerCase()
  const day = 24 * 60 * 60 * 1000

  if (normalizedUnit.startsWith("year")) {
    return Math.trunc(diff / (365 * day))
  }

  if (normalizedUnit.startsWith("quarter")) {
    return Math.trunc(diff / (91.25 * day))
  }

  if (normalizedUnit.startsWith("month")) {
    return Math.trunc(diff / (30.4375 * day))
  }

  if (normalizedUnit.startsWith("week")) {
    return Math.trunc(diff / (7 * day))
  }

  if (normalizedUnit.startsWith("day")) {
    return Math.trunc(diff / day)
  }

  if (normalizedUnit.startsWith("hour")) {
    return Math.trunc(diff / (60 * 60 * 1000))
  }

  if (normalizedUnit.startsWith("minute")) {
    return Math.trunc(diff / (60 * 1000))
  }

  throw new Error(`Unknown date unit: ${unit}`)
}

export function notionDay(date: Date) {
  const day = date.getDay()

  return day === 0 ? 7 : day
}

export function isoWeek(date: Date) {
  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  )
  const day = utcDate.getUTCDay() || 7

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))

  return Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  )
}

export function valueAtIndex(value: FormulaValue, rawIndex: number) {
  const index = Math.trunc(rawIndex)
  const values =
    typeof value === "string"
      ? [...value]
      : Array.isArray(value)
        ? value
        : [value]
  const normalizedIndex = index < 0 ? values.length + index : index

  return values[normalizedIndex] ?? null
}

export function regexTest(value: FormulaValue, pattern: FormulaValue) {
  try {
    return new RegExp(textValue(pattern)).test(textValue(value))
  } catch {
    return false
  }
}

export function regexMatches(value: FormulaValue, pattern: FormulaValue) {
  try {
    return Array.from(textValue(value).matchAll(new RegExp(textValue(pattern), "g")))
      .map((match) => match[0])
  } catch {
    return []
  }
}

export function replaceWithRegex(
  value: FormulaValue,
  pattern: FormulaValue,
  replacement: FormulaValue,
  all: boolean
) {
  try {
    return textValue(value).replace(
      new RegExp(textValue(pattern), all ? "g" : undefined),
      textValue(replacement)
    )
  } catch {
    return textValue(value)
  }
}
