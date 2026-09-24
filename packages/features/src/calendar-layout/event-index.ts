import { normalizeSpan } from "./normalize-span";
import type { CalendarSpan } from "./types";
import { addCalendarDays, dayInstant } from "./time";
/** A per-surface index retains day arrays when their ordered membership is unchanged. */
export function createEventIndex<T extends CalendarSpan>() {
  let previous: Record<string, T[]> = {};
  let boundsKey = "";
  let bounds: { day: string; start: number; end: number }[] = [];
  return (items: T[], days: string[], zone: string): Record<string, T[]> => {
    const key = `${zone}:${days.join(",")}`;
    if (key !== boundsKey) {
      boundsKey = key;
      bounds = days.map((day) => ({
        day,
        start: Date.parse(dayInstant(day, zone)),
        end: Date.parse(dayInstant(addCalendarDays(day, 1), zone)),
      }));
    }
    const next = indexOverlappingItems(items, bounds, zone);
    previous = retainUnchangedDays(previous, next, days);
    return next;
  };
}
function firstBoundIndex(bounds: { start: number; end: number }[], from: number) {
  let low = 0,
    high = bounds.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (bounds[middle]!.end <= from) low = middle + 1;
    else high = middle;
  }
  return low;
}
function indexOverlappingItems<T extends CalendarSpan>(
  items: T[],
  bounds: { day: string; start: number; end: number }[],
  zone: string,
) {
  const next = Object.fromEntries(bounds.map((bound) => [bound.day, [] as T[]]));
  for (const item of items) {
    const { from, until } = normalizeSpan(item, zone);
    if (until <= from) continue;
    for (
      let index = firstBoundIndex(bounds, from);
      index < bounds.length && bounds[index]!.start < until;
      index++
    )
      next[bounds[index]!.day]!.push(item);
  }
  return next;
}
function retainUnchangedDays<T>(
  previous: Record<string, T[]>,
  next: Record<string, T[]>,
  days: string[],
) {
  for (const day of days) {
    const old = previous[day],
      current = next[day]!;
    if (old && old.length === current.length && old.every((item, index) => item === current[index]))
      next[day] = old;
  }
  return next;
}
