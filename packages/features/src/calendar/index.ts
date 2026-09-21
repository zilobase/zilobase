import type { CalendarEvent } from "./contracts"
import { timedLayoutByKey } from "../calendar-layout/time"

export type * from "./contracts"
export { orderCalendarSources, moveCalendarSource } from "./source-order";
export { calendarConnectionReturnPath } from "./onboarding";
export { calendarCapability, type CalendarCapability, type CalendarOperation } from "./capabilities";
export { calendarApiBasePath, calendarKeys, calendarEventKey, defaultCalendarPreferences } from "./model"
export { calendarDate, dayInstant, addCalendarDays, todayInZone, wallTime, eventInstant, eventOverlaps, calendarDays, shiftCalendarPeriod, eventClock } from "../calendar-layout/time"
export type { CalendarSpan } from "../calendar-layout/types";
export { createEventIndex } from "../calendar-layout/event-index";
export { timelineGeometry, civilDayOrdinal, dateFromOrdinal, dateFromRank, visibleDateRank, contiguousTimeline, timeToPosition, positionToTime, timelineRetargets, snapTimelineOffset } from "../calendar-layout/timeline";
export { timedLayoutByKey } from "../calendar-layout/time";

export function timedLayout(events: CalendarEvent[], date: string, zone: string) {
  return timedLayoutByKey(events, date, zone, (event) => event.eventId)
}

export { calendarMetric, type CalendarMetricName } from "./telemetry";
export { normalizeCalendarView } from "../calendar-layout/types";
export { calendarLocationUrl, upcomingCalendarMeeting } from "./context";
export { calendarTravelPreferences } from "./travel";
