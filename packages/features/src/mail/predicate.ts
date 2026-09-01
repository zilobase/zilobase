import type { MailAddress, MailThreadSummary } from "./contracts"
import type {
  MailFilterCondition,
  MailFilterExpression,
  MailFilterValue,
} from "./organization"

export type MailFilterRecord = {
  attachmentCount: number
  bcc: MailAddress[]
  cc: MailAddress[]
  customValues?: Record<string, unknown>
  from: MailAddress[]
  hasCalendarEvent: boolean
  important: boolean
  internalDate: number
  labelIds: string[]
  starred: boolean
  subject: string
  to: MailAddress[]
  unread: boolean
}

export function evaluateMailFilterExpression(
  record: MailFilterRecord,
  expression: MailFilterExpression,
  now = new Date(),
): boolean {
  const matches = expression.filters.map((filter) => filter.type === "group"
    ? evaluateMailFilterExpression(record, filter, now)
    : evaluateMailFilterCondition(record, filter, now))
  return expression.operator === "or" ? matches.some(Boolean) : matches.every(Boolean)
}

export function evaluateMailFilterCondition(
  record: MailFilterRecord,
  condition: MailFilterCondition,
  now = new Date(),
) {
  const actual = propertyValue(record, condition.propertyId)
  const expected = condition.values
  switch (condition.operator) {
    case "is_empty": return isEmpty(actual)
    case "is_not_empty": return !isEmpty(actual)
    case "is": return compareAny(actual, expected, valuesEqual)
    case "is_not": return !compareAny(actual, expected, valuesEqual)
    case "contains": return compareAny(actual, expected, containsValue)
    case "does_not_contain": return !compareAny(actual, expected, containsValue)
    case "starts_with": return compareAny(actual, expected, (left, right) => text(left).startsWith(text(right)))
    case "ends_with": return compareAny(actual, expected, (left, right) => text(left).endsWith(text(right)))
    case "greater_than": return compareScalar(actual, expected[0], (left, right) => left > right)
    case "greater_than_or_equal": return compareScalar(actual, expected[0], (left, right) => left >= right)
    case "less_than": return compareScalar(actual, expected[0], (left, right) => left < right)
    case "less_than_or_equal": return compareScalar(actual, expected[0], (left, right) => left <= right)
    case "is_before": return compareDate(actual, expected[0], (left, right) => left < right)
    case "is_after": return compareDate(actual, expected[0], (left, right) => left > right)
    case "is_on_or_before": return compareDate(actual, expected[0], (left, right) => left <= right)
    case "is_on_or_after": return compareDate(actual, expected[0], (left, right) => left >= right)
    case "is_between": {
      const value = dateNumber(singleValue(actual))
      const start = dateNumber(expected[0])
      const end = dateNumber(expected[1])
      return value !== null && start !== null && end !== null && value >= start && value <= end
    }
    case "is_relative_to_today": {
      const value = dateNumber(singleValue(actual))
      const range = relativeDateRange(expected[0], now)
      return value !== null && range !== null && value >= range[0] && value < range[1]
    }
  }
}

export function mailFilterRecordFromThreadSummary(
  thread: MailThreadSummary,
): MailFilterRecord {
  return {
    attachmentCount: thread.attachmentCount,
    bcc: [],
    cc: [],
    from: thread.participants,
    hasCalendarEvent: false,
    important: thread.labelIds.includes("IMPORTANT"),
    internalDate: thread.internalDate,
    labelIds: thread.labelIds,
    starred: thread.starred,
    subject: thread.subject,
    to: thread.participants,
    unread: thread.unread,
  }
}

function propertyValue(record: MailFilterRecord, propertyId: string): unknown {
  switch (propertyId) {
    case "from": return addressValues(record.from)
    case "to": return addressValues(record.to)
    case "cc": return addressValues(record.cc)
    case "bcc": return addressValues(record.bcc)
    case "subject": return record.subject
    case "date":
    case "received_date": return record.internalDate
    case "attachments": return record.attachmentCount
    case "calendar_event": return record.hasCalendarEvent
    case "unread": return record.unread
    case "starred": return record.starred
    case "important":
    case "priority": return record.important
    case "labels": return record.labelIds
    case "categories": return record.labelIds
      .filter((label) => label.startsWith("CATEGORY_"))
      .map((label) => label.slice("CATEGORY_".length).toLowerCase())
    case "mailbox": return mailboxValues(record.labelIds)
    case "sent": return record.labelIds.includes("SENT")
    case "archived": return mailboxValues(record.labelIds).includes("archive")
    default: return record.customValues?.[propertyId]
  }
}

function mailboxValues(labelIds: string[]) {
  const values = [
    labelIds.includes("INBOX") ? "inbox" : null,
    labelIds.includes("SENT") ? "sent" : null,
    labelIds.includes("DRAFT") ? "drafts" : null,
    labelIds.includes("SPAM") ? "spam" : null,
    labelIds.includes("TRASH") ? "bin" : null,
  ].filter((value): value is string => value !== null)
  if (!values.length) values.push("archive")
  values.push("all_mail")
  return values
}

function addressValues(addresses: MailAddress[]) {
  return addresses.flatMap(({ address, name }) => name ? [address, name] : [address])
}

function compareAny(
  actual: unknown,
  expected: MailFilterValue[],
  compare: (left: unknown, right: unknown) => boolean,
) {
  const actualValues = Array.isArray(actual) ? actual : [actual]
  return actualValues.some((left) => expected.some((right) => compare(left, right)))
}

function compareScalar(
  actual: unknown,
  expected: unknown,
  compare: (left: number, right: number) => boolean,
) {
  const left = numberValue(singleValue(actual))
  const right = numberValue(expected)
  return left !== null && right !== null && compare(left, right)
}

function compareDate(
  actual: unknown,
  expected: unknown,
  compare: (left: number, right: number) => boolean,
) {
  const left = dateNumber(singleValue(actual))
  const right = dateNumber(expected)
  return left !== null && right !== null && compare(left, right)
}

function valuesEqual(left: unknown, right: unknown) {
  if (typeof left === "string" && typeof right === "string") {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

function containsValue(left: unknown, right: unknown) {
  return text(left).includes(text(right))
}

function text(value: unknown) {
  return String(value ?? "").toLowerCase()
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function dateNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function singleValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "" ||
    (Array.isArray(value) && value.length === 0)
}

function relativeDateRange(value: unknown, now: Date): [number, number] | null {
  if (typeof value !== "string") return null
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 24 * 60 * 60 * 1_000
  switch (value) {
    case "today": return [startToday, startToday + day]
    case "yesterday": return [startToday - day, startToday]
    case "tomorrow": return [startToday + day, startToday + 2 * day]
    case "past_week": return [startToday - 7 * day, startToday + day]
    case "next_week": return [startToday, startToday + 8 * day]
    case "past_month": return [new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime(), startToday + day]
    case "next_month": return [startToday, new Date(now.getFullYear(), now.getMonth() + 1, now.getDate() + 1).getTime()]
    default: return null
  }
}
