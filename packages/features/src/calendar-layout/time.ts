import { MinHeap } from "./min-heap";
import { normalizeSpan } from "./normalize-span";
import { Temporal } from "@js-temporal/polyfill";
import type { CalendarTime as CalendarEventTime, CalendarSpan, CalendarView } from "./types";
export function calendarDate(time: CalendarEventTime, zone: string) {
  return (
    time.date ??
    Temporal.Instant.from(time.dateTime!).toZonedDateTimeISO(zone).toPlainDate().toString()
  );
}
export function dayInstant(date: string, zone: string) {
  return Temporal.PlainDate.from(date).toZonedDateTime(zone).toInstant().toString();
}
export function addCalendarDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function todayInZone(zone: string) {
  return Temporal.Now.plainDateISO(zone).toString();
}
export function wallTime(
  date: string,
  time: string,
  zone: string,
  choice: "reject" | "earlier" | "later" = "reject",
) {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(zone, { disambiguation: choice })
    .toInstant()
    .toString();
}
export function eventInstant(time: CalendarEventTime, zone: string) {
  return time.date ? dayInstant(time.date, zone) : time.dateTime!;
}
export function eventOverlaps(event: CalendarSpan, start: string, end: string, zone: string) {
  return (
    Date.parse(eventInstant(event.start, zone)) < Date.parse(end) &&
    Date.parse(eventInstant(event.end, zone)) > Date.parse(start)
  );
}
export function calendarDays(
  date: string,
  view: CalendarView,
  weekStartsOn: number,
  dayCount = 7,
  showWeekends = true,
  alignStart = false,
) {
  if (view === "day") return [date];
  if (view === "month") return alignedPeriodDays(date, weekStartsOn, true);
  if (dayCount !== 7 || alignStart) return customWeekDays(date, dayCount, showWeekends);
  return alignedPeriodDays(date, weekStartsOn, false);
}
function customWeekDays(date: string, dayCount: number, showWeekends: boolean) {
  const days: string[] = [];
  let day = Temporal.PlainDate.from(date);
  while (days.length < Math.max(1, Math.min(31, Math.trunc(dayCount)))) {
    if (showWeekends || day.dayOfWeek < 6) days.push(day.toString());
    day = day.add({ days: 1 });
  }
  return days;
}
function alignedPeriodDays(date: string, weekStartsOn: number, month: boolean) {
  const anchor = Temporal.PlainDate.from(date);
  const first = month ? anchor.with({ day: 1 }) : anchor;
  const offset = ((first.dayOfWeek % 7) - weekStartsOn + 7) % 7,
    start = first.subtract({ days: offset });
  return Array.from(
    { length: month ? Math.ceil((offset + anchor.daysInMonth) / 7) * 7 : 7 },
    (_, i) => start.add({ days: i }).toString(),
  );
}
export function shiftCalendarPeriod(
  date: string,
  view: CalendarView,
  direction: number,
  dayCount = 7,
  showWeekends = true,
  alignStart = false,
) {
  if (view === "week" && (dayCount !== 7 || alignStart) && !showWeekends)
    return shiftBusinessDays(date, direction, dayCount);
  const span =
    view === "month"
      ? { months: direction }
      : {
          days: direction * (view === "day" ? 1 : Math.max(1, Math.min(31, Math.trunc(dayCount)))),
        };
  return Temporal.PlainDate.from(date).add(span).toString();
}
function shiftBusinessDays(date: string, direction: number, dayCount: number) {
  let anchor = Temporal.PlainDate.from(date);
  while (anchor.dayOfWeek > 5) anchor = anchor.add({ days: 1 });
  let remaining = Math.abs(direction) * Math.max(1, Math.min(31, Math.trunc(dayCount)));
  while (remaining > 0) {
    anchor = anchor.add({ days: Math.sign(direction) });
    if (anchor.dayOfWeek < 6) remaining--;
  }
  return anchor.toString();
}
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
function clockFormatter(zone: string, format: "12" | "24") {
  const key = `${zone}:${format}`;
  let formatter = clockFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
      hour12: format === "12",
    });
    clockFormatters.set(key, formatter);
  }
  return formatter;
}
export function eventClock(time: CalendarEventTime, zone: string, format: "12" | "24" = "24") {
  return time.date ? "All day" : clockFormatter(zone, format).format(new Date(time.dateTime!));
}
export function timedLayoutByKey<T extends CalendarSpan>(
  events: T[],
  date: string,
  zone: string,
  key: (event: T) => string,
) {
  const start = Date.parse(dayInstant(date, zone)),
    end = Date.parse(dayInstant(addCalendarDays(date, 1), zone));
  const items = events
    .filter((e) => {
      const span = normalizeSpan(e, zone);
      return !e.start.date && span.from < end && span.until > start;
    })
    .map((event) => {
      const span = normalizeSpan(event, zone);
      return {
        event,
        top: span.from < start ? 0 : span.startMinute,
        bottom: span.until >= end ? 1440 : span.endMinute,
        column: 0,
        columns: 1,
      };
    })
    .sort(
      (a, b) => a.top - b.top || b.bottom - a.bottom || key(a.event).localeCompare(key(b.event)),
    );
  let group: typeof items = [],
    groupEnd = -1,
    nextColumn = 0;
  const active = new MinHeap<{ bottom: number; column: number }>((a, b) => a.bottom - b.bottom);
  const free = new MinHeap<number>((a, b) => a - b);
  const finish = () => {
    for (const item of group) item.columns = Math.max(1, nextColumn);
    group = [];
    active.clear();
    free.clear();
    nextColumn = 0;
  };
  for (const item of items) {
    item.bottom = Math.max(item.top + 15, item.bottom);
    if (item.top >= groupEnd) {
      finish();
      groupEnd = -1;
    }
    while (active.peek() && active.peek()!.bottom <= item.top) free.push(active.pop()!.column);
    item.column = free.pop() ?? nextColumn++;
    active.push(item);
    group.push(item);
    groupEnd = Math.max(groupEnd, item.bottom);
  }
  finish();
  return items;
}
