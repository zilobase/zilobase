import { Temporal } from "@js-temporal/polyfill";

const epoch = Temporal.PlainDate.from("1970-01-05"); // Monday
export type TimelineAnchor = { date: string; fraction: number; minute: number };
export type TimelineCoverage = { start: string; end: string };
export const civilDayOrdinal = (date: string) => epoch.until(Temporal.PlainDate.from(date)).days;
export const dateFromOrdinal = (ordinal: number) => epoch.add({ days: ordinal }).toString();
export function visibleDateRank(date: string, weekends = true) {
  const ordinal = civilDayOrdinal(date);
  if (weekends) return ordinal;
  const week = Math.floor(ordinal / 7),
    weekday = ordinal - week * 7;
  return week * 5 + Math.min(weekday, 4);
}
export function dateFromRank(rank: number, weekends = true) {
  const week = Math.floor(rank / 5);
  return dateFromOrdinal(weekends ? rank : week * 7 + rank - week * 5);
}
export function timelineGeometry(origin: string, size: number, weekends = true) {
  if (!(size > 0)) throw new Error("Timeline item size must be positive");
  const base = visibleDateRank(origin, weekends);
  return {
    dateToPosition: (date: string) => (visibleDateRank(date, weekends) - base) * size,
    positionToDate: (position: number) =>
      dateFromRank(base + Math.floor(position / size), weekends),
    anchor(position: number, minute = 0): TimelineAnchor {
      const offset = position / size;
      return {
        date: dateFromRank(base + Math.floor(offset), weekends),
        fraction: offset - Math.floor(offset),
        minute,
      };
    },
    restore: (anchor: TimelineAnchor) =>
      (visibleDateRank(anchor.date, weekends) - base + anchor.fraction) * size,
  };
}
/** Passive scroll updates keep the visual origin; only explicit date changes jump. */
export function timelineRetargets(
  previousDate: string | null,
  date: string,
  emitted: string | null,
) {
  return previousDate == null || (previousDate !== date && date !== emitted);
}
/** Minimum px displacement to bother snapping. Below this, accept current position. */
const SNAP_DEAD_ZONE = 2;

export function snapTimelineOffset(offset: number, size: number): number | null {
  if (!(size > 0)) return null;
  const snapped = Math.round(offset / size) * size;
  return Math.abs(offset - snapped) <= SNAP_DEAD_ZONE ? null : snapped;
}
export const timeToPosition = (minute: number, hourHeight: number) => (minute * hourHeight) / 60;
export const positionToTime = (position: number, hourHeight: number) =>
  (position * 60) / hourHeight;

/** Extend only through complete adjacent items; never infer readiness from event count. */
export function contiguousTimeline(
  anchor: number,
  count: number,
  ready: (index: number) => boolean,
) {
  if (!ready(anchor)) return { first: anchor, last: anchor - 1 };
  let first = anchor,
    last = anchor;
  while (first > 0 && ready(first - 1)) first--;
  while (last + 1 < count && ready(last + 1)) last++;
  return { first, last };
}
