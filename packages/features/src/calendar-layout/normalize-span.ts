import { Temporal } from "@js-temporal/polyfill";
import type { CalendarSpan } from "./types";
type NormalizedSpan = {
  zone: string;
  from: number;
  until: number;
  startMinute: number;
  endMinute: number;
};
const timing = new WeakMap<CalendarSpan, NormalizedSpan>();
/** Callers replace items when timing changes; cached values never retain old items. */
export function normalizeSpan(item: CalendarSpan, zone: string): NormalizedSpan {
  const cached = timing.get(item);
  if (cached?.zone === zone) return cached;
  const start = item.start.date
    ? null
    : Temporal.Instant.from(item.start.dateTime!).toZonedDateTimeISO(zone);
  const end = item.end.date
    ? null
    : Temporal.Instant.from(item.end.dateTime!).toZonedDateTimeISO(zone);
  const result = {
    zone,
    from: start
      ? start.epochMilliseconds
      : Temporal.PlainDate.from(item.start.date!).toZonedDateTime(zone).epochMilliseconds,
    until: end
      ? end.epochMilliseconds
      : Temporal.PlainDate.from(item.end.date!).toZonedDateTime(zone).epochMilliseconds,
    startMinute: start ? start.hour * 60 + start.minute : 0,
    endMinute: end ? end.hour * 60 + end.minute : 0,
  };
  timing.set(item, result);
  return result;
}
