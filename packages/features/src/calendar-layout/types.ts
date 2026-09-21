/** Date-only ends are exclusive. Timed values represent instants in an IANA zone. */
export type CalendarTime = { date: string; dateTime?: never; timeZone?: never } | { date?: never; dateTime: string; timeZone: string };
export type CalendarSpan = { start: CalendarTime; end: CalendarTime };
export type CalendarView = "day" | "week" | "month";

/** Missing or invalid route values use Week. */
export function normalizeCalendarView(value: unknown): CalendarView { return value === "day" || value === "month" ? value : "week"; }
