import assert from "node:assert/strict"
import test from "node:test"

import type { DatabaseAutomationSchedule } from "./contracts"
import {
  getLatestDatabaseAutomationOccurrence,
  getNextDatabaseAutomationOccurrence,
  resolveDatabaseAutomationLocalTime,
} from "./schedule"

const schedule = (overrides: Partial<DatabaseAutomationSchedule> = {}): DatabaseAutomationSchedule => ({
  frequency: "daily",
  interval: 1,
  localTime: "09:30",
  startDate: "2026-01-01",
  timezone: "UTC",
  ...overrides,
})

test("calculates daily and interval occurrences without replaying from the start", () => {
  const value = schedule({ interval: 3 })
  assert.equal(getLatestDatabaseAutomationOccurrence(value, new Date("2036-01-11T12:00:00Z"))?.toISOString(), "2036-01-09T09:30:00.000Z")
  assert.equal(getNextDatabaseAutomationOccurrence(value, new Date("2036-01-11T12:00:00Z"))?.toISOString(), "2036-01-12T09:30:00.000Z")
})

test("finds the next occurrence for the maximum interval", () => {
  const value = schedule({ interval: 365 })
  assert.equal(getNextDatabaseAutomationOccurrence(value, new Date("2026-01-02T00:00:00Z"))?.toISOString(), "2027-01-01T09:30:00.000Z")
})

test("keeps selected weekdays in interval-anchored weeks", () => {
  const value = schedule({ frequency: "weekly", interval: 2, startDate: "2026-09-07", weekdays: [1, 5] })
  assert.equal(getNextDatabaseAutomationOccurrence(value, new Date("2026-09-07T10:00:00Z"))?.toISOString(), "2026-09-11T09:30:00.000Z")
  assert.equal(getNextDatabaseAutomationOccurrence(value, new Date("2026-09-11T10:00:00Z"))?.toISOString(), "2026-09-21T09:30:00.000Z")
})

test("clamps month ends and supports the last day", () => {
  const numeric = schedule({ dayOfMonth: 31, frequency: "monthly", startDate: "2026-01-31" })
  const last = schedule({ dayOfMonth: "last", frequency: "monthly", startDate: "2028-01-31" })
  assert.equal(getNextDatabaseAutomationOccurrence(numeric, new Date("2026-02-01T00:00:00Z"))?.toISOString(), "2026-02-28T09:30:00.000Z")
  assert.equal(getNextDatabaseAutomationOccurrence(last, new Date("2028-02-01T00:00:00Z"))?.toISOString(), "2028-02-29T09:30:00.000Z")
})

test("supports selected months, leap years, and end dates", () => {
  const value = schedule({ dayOfMonth: 29, endDate: "2028-02-29", frequency: "yearly", months: [2], startDate: "2027-01-01" })
  assert.equal(getNextDatabaseAutomationOccurrence(value, new Date("2027-03-01T00:00:00Z"))?.toISOString(), "2028-02-29T09:30:00.000Z")
  assert.equal(getNextDatabaseAutomationOccurrence(value, new Date("2028-03-01T00:00:00Z")), null)
})

test("runs a spring gap at the first valid instant and a fall fold once", () => {
  assert.equal(resolveDatabaseAutomationLocalTime("2026-03-08", "02:30", "America/New_York").toISOString(), "2026-03-08T07:00:00.000Z")
  assert.equal(resolveDatabaseAutomationLocalTime("2026-11-01", "01:30", "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z")
})

test("custom schedules select their recurrence dimension", () => {
  const weekly = schedule({ frequency: "custom", interval: 1, startDate: "2026-09-07", weekdays: [3] })
  const monthly = schedule({ dayOfMonth: "last", frequency: "custom", interval: 2, startDate: "2026-01-01" })
  assert.equal(getNextDatabaseAutomationOccurrence(weekly, new Date("2026-09-07T12:00:00Z"))?.toISOString(), "2026-09-09T09:30:00.000Z")
  assert.equal(getNextDatabaseAutomationOccurrence(monthly, new Date("2026-01-31T10:00:00Z"))?.toISOString(), "2026-03-31T09:30:00.000Z")
})
