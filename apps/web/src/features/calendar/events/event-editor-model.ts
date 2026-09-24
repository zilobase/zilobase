import { calendarDate, addCalendarDays, type CalendarEvent } from "@zilobase/features/calendar";
function clock(value: CalendarEvent["start"], zone: string) {
  return value.date
    ? "09:00"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value.dateTime!));
}
export function eventEditorDefaults(event: CalendarEvent, zone: string) {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startDate: calendarDate(event.start, zone),
    endDate: event.end.date ? addCalendarDays(event.end.date, -1) : calendarDate(event.end, zone),
    startTime: clock(event.start, zone),
    endTime: clock(event.end, zone),
    allDay: Boolean(event.start.date),
    timeZone: zone,
    disambiguation: "reject" as "reject" | "earlier" | "later",
    guests: event.attendees.map((a) => a.email).join(", "),
    sendUpdates: "all" as "all" | "none",
    calendarId: event.calendarId,
    colorId: event.colorId ?? "default",
    busy: event.transparency,
    visibility: event.visibility === "confidential" ? "private" : event.visibility,
    defaultReminders: event.reminders.useDefault,
    reminder: event.reminders.overrides?.[0]?.minutes ?? 10,
    meet: false,
  };
}
export type EventEditorDraft = ReturnType<typeof eventEditorDefaults>;

import { wallTime, type CalendarEventWriteRequest } from "@zilobase/features/calendar";
function editorInterval(draft: EventEditorDraft) {
  const start = draft.allDay
    ? { date: draft.startDate }
    : {
        dateTime: wallTime(draft.startDate, draft.startTime, draft.timeZone, draft.disambiguation),
        timeZone: draft.timeZone,
      };
  const end = draft.allDay
    ? { date: addCalendarDays(draft.endDate, 1) }
    : {
        dateTime: wallTime(draft.endDate, draft.endTime, draft.timeZone, draft.disambiguation),
        timeZone: draft.timeZone,
      };
  if (Date.parse(end.date ?? end.dateTime!) <= Date.parse(start.date ?? start.dateTime!))
    throw new Error("End must be after start.");
  return { start, end };
}
function editorGuests(event: CalendarEvent, value: string) {
  const emails = [
    ...new Set(
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return emails.map(
    (email) =>
      event.attendees.find((a) => a.email === email) ?? {
        email,
        responseStatus: "needsAction" as const,
      },
  );
}
function editorRecurrence(
  event: CalendarEvent,
  draft: EventEditorDraft,
  recurrence: string[] | undefined,
  scope: string,
) {
  if (!recurrence || (event.recurringEventId && scope === "occurrence")) return {};
  return {
    recurrence: draft.allDay ? recurrence.map((rule) => rule.replace(/T235959Z/g, "")) : recurrence,
  };
}
function editorReminders(event: CalendarEvent, draft: EventEditorDraft) {
  if (draft.defaultReminders) return { useDefault: true };
  if (!event.reminders.useDefault && draft.reminder === event.reminders.overrides?.[0]?.minutes)
    return event.reminders;
  return { useDefault: false, overrides: [{ method: "popup" as const, minutes: draft.reminder }] };
}
export function editorWrite(
  event: CalendarEvent,
  draft: EventEditorDraft,
  isNew: boolean,
  recurrence: string[] | undefined,
  scope: "occurrence" | "following" | "series",
): CalendarEventWriteRequest {
  return {
    operationId: crypto.randomUUID(),
    etag: isNew ? undefined : event.etag,
    sendUpdates: draft.sendUpdates,
    recurrenceScope: event.recurringEventId ? scope : undefined,
    createMeet: draft.meet,
    event: {
      ...editorInterval(draft),
      ...editorRecurrence(event, draft, recurrence, scope),
      title: draft.title,
      description: draft.description,
      location: draft.location,
      colorId: draft.colorId === "default" ? null : draft.colorId,
      transparency: draft.busy,
      visibility: draft.visibility as CalendarEvent["visibility"],
      attendees: editorGuests(event, draft.guests),
      reminders: editorReminders(event, draft),
    },
  };
}

export function eventEditorZone(
  event: CalendarEvent,
  calendars: import("@zilobase/features/calendar").CalendarRecord[],
) {
  return (
    event.start.timeZone ?? calendars.find((c) => c.id === event.calendarId)?.timeZone ?? "UTC"
  );
}
