export type CalendarScope = { workspaceId: string; bindingId: string }
export type CalendarIdentity = CalendarScope & { calendarId: string; eventId: string }
export type CalendarEventTime = { date: string; dateTime?: never; timeZone?: never } | { date?: never; dateTime: string; timeZone: string }
export type CalendarPermissions = { read: boolean; write: boolean; owner: boolean; freeBusyOnly: boolean }
export type CalendarConnection = CalendarScope & { workspaceName?: string; accountId: string; email: string; status: "connected" | "reconnect_required"; pushAvailable: boolean }
export type CalendarRecord = { id: string; bindingId: string; name: string; timeZone: string; colorId: string | null; primary: boolean; permissions: CalendarPermissions; defaultReminders: CalendarReminder[] }
export type CalendarReminder = { method: "email" | "popup"; minutes: number }
export type CalendarAttendee = { email: string; displayName?: string; optional?: boolean; self?: boolean; organizer?: boolean; responseStatus: "needsAction" | "declined" | "tentative" | "accepted" }
export type CalendarEvent = CalendarIdentity & {
  etag: string; title: string; description: string; location: string;
  start: CalendarEventTime; end: CalendarEventTime;
  status: "confirmed" | "tentative" | "cancelled"; eventType: string;
  recurringEventId?: string; originalStartTime?: CalendarEventTime; recurrence?: string[];
  attendees: CalendarAttendee[]; organizer?: { email: string; self?: boolean };
  reminders: { useDefault: boolean; overrides?: CalendarReminder[] };
  transparency: "opaque" | "transparent"; visibility: "default" | "public" | "private" | "confidential";
  colorId: string | null; htmlLink: string; conferenceUrl?: string; conferenceStatus?: "pending" | "success" | "failure";
}
export type CalendarOccurrence = CalendarEvent
export type CalendarView = "day" | "week" | "month"
export type CalendarRangeRequest = { calendarId: string; start: string; end: string; pageToken?: string }
export type CalendarRangeResponse = { calendarId: string; start: string; end: string; generation: number; revision: number; events: CalendarOccurrence[]; nextPageToken: string | null; complete: boolean }
export type CalendarSyncRequest = { calendarId?: string }
export type CalendarSyncResponse = { calendars: CalendarRecord[]; revisions: Record<string, number>; pending: boolean }
export type CalendarEventWriteRequest = {
  operationId: string; event: Partial<Omit<CalendarEvent, keyof CalendarIdentity | "etag">>;
  etag?: string; sendUpdates: "all" | "externalOnly" | "none";
  recurrenceScope?: "occurrence" | "following" | "series"; createMeet?: boolean;
}
export type CalendarMutationResponse = { operationId: string; status: "pending" | "ambiguous" | "succeeded" | "failed"; event?: CalendarEvent; error?: string }
export type CalendarColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "gray"
export type CalendarTimeZoneColumn = { zone: string; label: string };
export type CalendarPreferences = {
  promptTimeZoneChanges: boolean;
  timeZoneColumns: CalendarTimeZoneColumn[];
  todayAlignment: "week" | "start"; meetingPreviewMinutes: number; mapsProvider: "google" | "apple";
  hourHeight: number;
  accountOrder: string[]; calendarOrder: string[]; collapsedAccountIds: string[];
  calendarColors: Record<string, CalendarColor>; removedCalendarKeys: string[];
  view: CalendarView; hiddenCalendarKeys: string[]; defaultCalendarKey: string | null;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6; showWeekends: boolean; showDeclined: boolean;
  showWeekNumbers: boolean; timeFormat: "12" | "24"; timeZone: string; remindersEnabled: boolean;
}
export type CalendarInvalidation = CalendarScope & { type: "calendar.invalidate"; calendarId: string; revision: number; generation: number }
