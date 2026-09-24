import type {
  CalendarConnection,
  CalendarRecord,
  CalendarPreferences,
} from "@zilobase/features/calendar";
import { createCalendarSelectionMatcher } from "../connections/calendar-selection";
export type CalendarWindow = { start: string; end: string };
/** Return only holes, composing adjacent and overlapping complete snapshots. */
export function missingCalendarRanges(start: string, end: string, ranges: CalendarWindow[]) {
  const missing: CalendarWindow[] = [];
  let cursor = Date.parse(start);
  const until = Date.parse(end);
  for (const range of [...ranges].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const from = Math.max(Date.parse(start), Date.parse(range.start)),
      to = Math.min(until, Date.parse(range.end));
    if (to <= cursor || from >= until) continue;
    if (from > cursor)
      missing.push({ start: new Date(cursor).toISOString(), end: new Date(from).toISOString() });
    cursor = Math.max(cursor, to);
  }
  if (cursor < until)
    missing.push({ start: new Date(cursor).toISOString(), end: new Date(until).toISOString() });
  return missing;
}
export const coversCalendarRange = (ranges: CalendarWindow[], target: CalendarWindow) =>
  missingCalendarRanges(target.start, target.end, ranges).length === 0;

export type CalendarCoverageSnapshot = {
  requestKey?: string;
  catalogLoaded: boolean;
  calendars: CalendarRecord[];
  coverage: { calendarId: string; ranges: CalendarWindow[] }[];
};
export function calendarSnapshotMatches(
  snapshot: Pick<CalendarCoverageSnapshot, "requestKey"> | undefined,
  userId: string,
  connection: Pick<CalendarConnection, "workspaceId" | "bindingId">,
) {
  return Boolean(
    snapshot?.requestKey?.startsWith(
      JSON.stringify([userId, connection.workspaceId, connection.bindingId]).slice(0, -1) + ",",
    ),
  );
}
export function calendarRangeReady(
  connections: Pick<CalendarConnection, "workspaceId" | "bindingId">[],
  snapshots: Record<string, CalendarCoverageSnapshot>,
  userId: string,
  preferences: CalendarPreferences,
  range: CalendarWindow,
) {
  const matcher = createCalendarSelectionMatcher(preferences);
  return connections.every((connection) => {
    const snapshot = snapshots[connection.bindingId];
    return (
      calendarSnapshotMatches(snapshot, userId, connection) &&
      snapshot?.catalogLoaded &&
      snapshot.calendars
        .filter(
          (calendar) =>
            calendar.permissions.read &&
            !calendar.permissions.freeBusyOnly &&
            matcher.isVisible(connection.bindingId, calendar.id),
        )
        .every((calendar) =>
          coversCalendarRange(
            snapshot.coverage.find((c) => c.calendarId === calendar.id)?.ranges ?? [],
            range,
          ),
        )
    );
  });
}
