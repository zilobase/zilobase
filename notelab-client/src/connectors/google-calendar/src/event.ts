import type {
  GoogleCalendarEvent,
  GoogleCalendarEventSummary,
} from "./types.js";

export function summarizeGoogleCalendarEvent(
  calendarId: string,
  event: GoogleCalendarEvent,
): GoogleCalendarEventSummary {
  return {
    attendees: event.attendees,
    calendarId,
    description: event.description,
    end: event.end,
    htmlLink: event.htmlLink,
    id: event.id,
    location: event.location,
    organizer: event.organizer,
    start: event.start,
    status: event.status,
    summary: event.summary,
  };
}
