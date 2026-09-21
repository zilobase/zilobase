import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventIndex, timedLayout, dayInstant, addCalendarDays, eventOverlaps, type CalendarSpan } from "./index";
import { normalizeSpan } from "./normalize-span";
const span = (id: string, start: string, end: string) => ({ id, start: { dateTime: start, timeZone: "UTC" }, end: { dateTime: end, timeZone: "UTC" } });
test("index respects exclusive ends, gaps in visible weekdays, and retains unchanged membership", () => {
  const index = createEventIndex<CalendarSpan>();
  const event = { start: { date: "2026-09-04" }, end: { date: "2026-09-08" } };
  const days = ["2026-09-04", "2026-09-07", "2026-09-08"];
  const first = index([event], days, "Asia/Kolkata");
  assert.deepEqual(first[days[0]!], [event]); assert.deepEqual(first[days[1]!], [event]); assert.deepEqual(first[days[2]!], []);
  const next = index([event], [...days, "2026-09-09"], "Asia/Kolkata");
  assert.equal(first[days[0]!], next[days[0]!]);
  assert.equal(normalizeSpan(event, "UTC"), normalizeSpan(event, "UTC"));
  assert.notEqual(normalizeSpan(event, "UTC"), normalizeSpan(event, "Asia/Kolkata"));
  assert.deepEqual(index([], days, "Asia/Kolkata")[days[0]!], []);
});
test("bounded index matches interval overlap across a DST transition", () => {
  const days = Array.from({ length: 12 }, (_, i) => addCalendarDays("2026-03-03", i));
  const events = Array.from({ length: 200 }, (_, i) => span(String(i), new Date(Date.UTC(2026, 2, 1, i * 2)).toISOString(), new Date(Date.UTC(2026, 2, 1, i * 2 + 37)).toISOString()));
  const indexed = createEventIndex()(events, days, "America/New_York");
  for (const day of days) assert.deepEqual(indexed[day], events.filter(event => eventOverlaps(event, dayInstant(day, "America/New_York"), dayInstant(addCalendarDays(day, 1), "America/New_York"), "America/New_York")));
});
test("heap layout retains first-free-column behavior and connected overlap groups", () => {
  const events = Array.from({ length: 300 }, (_, i) => span(String(i), new Date(Date.UTC(2026, 8, 9, 0, (i * 37) % 1300)).toISOString(), new Date(Date.UTC(2026, 8, 9, 0, (i * 37) % 1300 + 15 + i % 120)).toISOString()));
  const layout = timedLayout(events, "2026-09-09", "UTC", e => e.id);
  let group: typeof layout = [], end = -1;
  for (const item of layout) {
    if (item.top >= end) { group = []; end = -1; }
    const occupied = new Set(group.filter(e => e.bottom > item.top).map(e => e.column));
    let column = 0; while (occupied.has(column)) column++;
    assert.equal(item.column, column);
    group.push(item); end = Math.max(end, item.bottom);
  }
  const same = Array.from({ length: 10000 }, (_, i) => span(String(i), "2026-09-09T09:00:00Z", "2026-09-09T10:00:00Z"));
  const dense = timedLayout(same, "2026-09-09", "UTC", e => e.id);
  assert.equal(new Set(dense.map(e => e.column)).size, same.length);
  assert.ok(dense.every(e => e.columns === same.length));
});
test("midnight clipping preserves exclusive ends and DST ambiguity remains explicit", async () => {
  const { wallTime } = await import("./time");
  assert.throws(() => wallTime("2026-11-01", "01:30", "America/New_York"));
  assert.equal(Date.parse(wallTime("2026-11-01", "01:30", "America/New_York", "later")) - Date.parse(wallTime("2026-11-01", "01:30", "America/New_York", "earlier")), 3600000);
  const event = span("night", "2026-09-09T23:30:00Z", "2026-09-10T00:30:00Z");
  const before = timedLayout([event], "2026-09-09", "UTC", e => e.id)[0]!;
  const after = timedLayout([event], "2026-09-10", "UTC", e => e.id)[0]!;
  assert.equal(before.top, 1410); assert.equal(before.bottom, 1440);
  assert.equal(after.top, 0); assert.equal(after.bottom, 30);
  assert.deepEqual(timedLayout([span("ends", "2026-09-09T23:00:00Z", "2026-09-10T00:00:00Z")], "2026-09-10", "UTC", e => e.id), []);
});
test("retired and absent views normalize to Week", async () => {
  const { normalizeCalendarView } = await import("./index");
  assert.equal(normalizeCalendarView("invalid"), "week");
  assert.equal(normalizeCalendarView(undefined), "week");
  assert.equal(normalizeCalendarView("month"), "month");
  assert.equal(normalizeCalendarView("day"), "day");
});

test("custom periods cover 1–31 days and page without overlaps across DST", async () => {
  const { calendarDays, shiftCalendarPeriod } = await import("./time");
  for (let count = 1; count <= 31; count++) {
    for (const weekends of [true, false]) {
      const date = "2026-03-07";
      const days = calendarDays(date, "week", 1, count, weekends).filter(day => weekends || new Date(`${day}T12:00Z`).getUTCDay() % 6 !== 0);
      assert.equal(days.length, count === 7 && !weekends ? 5 : count);
      const next = calendarDays(shiftCalendarPeriod(date, "week", 1, count, weekends), "week", 1, count, weekends);
      const previous = calendarDays(shiftCalendarPeriod(date, "week", -1, count, weekends), "week", 1, count, weekends);
      assert.ok(previous.at(-1)! < days[0]!);
      assert.ok(days.at(-1)! < next[0]!);
      assert.ok(Number.isFinite(Date.parse(dayInstant(days[0]!, "America/New_York"))));
    }
  }
  assert.deepEqual(calendarDays("2026-09-15", "week", 1), ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]);
});
