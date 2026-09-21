import { test } from "node:test";
import assert from "node:assert/strict";
import { wallTime, addCalendarDays, dayInstant, calendarDays } from "../calendar-layout/time";
test("IANA conversion rejects nonexistent and ambiguous DST wall times", () => {
  assert.throws(() => wallTime("2026-03-08", "02:30", "America/New_York"));
  assert.throws(() => wallTime("2026-11-01", "01:30", "America/New_York"));
  assert.notEqual(wallTime("2026-11-01", "01:30", "America/New_York", "earlier"), wallTime("2026-11-01", "01:30", "America/New_York", "later"));
  assert.equal(wallTime("2026-09-09", "09:00", "Asia/Kolkata"), "2026-09-09T03:30:00Z");
  assert.equal(wallTime("2026-09-09", "09:00", "Asia/Kathmandu"), "2026-09-09T03:15:00Z");
});
test("calendar dates remain date-only across leap years and short DST days", () => {
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(Date.parse(dayInstant("2026-03-09", "America/New_York")) - Date.parse(dayInstant("2026-03-08", "America/New_York")), 23 * 3600_000);
  assert.equal(calendarDays("2026-09-09", "week", 1)[0], "2026-09-07");
});
