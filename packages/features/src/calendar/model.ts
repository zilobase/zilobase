import type { CalendarIdentity, CalendarPreferences, CalendarScope } from "./contracts"
export function calendarApiBasePath(workspaceId: string) {
  if (!workspaceId.trim()) throw new Error("A workspace is required")
  return `/workspaces/${encodeURIComponent(workspaceId)}/calendar`
}
export function calendarEventKey(identity: CalendarIdentity) {
  return JSON.stringify([identity.workspaceId, identity.bindingId, identity.calendarId, identity.eventId])
}
export const calendarKeys = {
  all: ["calendar"] as const,
  sources: (userId: string, workspaceId: string) => ["calendar", "sources", userId, workspaceId] as const,
  connections: (workspaceId: string) => ["calendar", workspaceId, "connections"] as const,
  preferences: (workspaceId: string) => ["calendar", workspaceId, "preferences"] as const,
  calendars: (scope: CalendarScope) => ["calendar", scope.workspaceId, scope.bindingId, "calendars"] as const,
}
export function defaultCalendarPreferences(timeZone = "UTC"): CalendarPreferences {
  return { promptTimeZoneChanges: false, timeZoneColumns: [{ zone: timeZone, label: timeZone.split("/").at(-1)!.replaceAll("_", " ") }], todayAlignment: "week", meetingPreviewMinutes: 15, mapsProvider: "google", hourHeight: 48, accountOrder: [], calendarOrder: [], collapsedAccountIds: [], calendarColors: {}, removedCalendarKeys: [], view: "week", hiddenCalendarKeys: [], defaultCalendarKey: null, weekStartsOn: 1, showWeekends: true, showDeclined: false, showWeekNumbers: false, timeFormat: "24", timeZone, remindersEnabled: false }
}
