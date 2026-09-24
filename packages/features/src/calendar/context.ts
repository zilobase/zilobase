import type { CalendarEvent } from "./contracts";

export function calendarLocationUrl(location: string, provider: "google" | "apple" = "google") {
  const url = new URL(
    provider === "apple" ? "https://maps.apple.com/" : "https://www.google.com/maps/search/",
  );
  if (provider === "google") url.searchParams.set("api", "1");
  url.searchParams.set(provider === "apple" ? "q" : "query", location);
  return url.toString();
}

/** Callers must supply only individually authorized, visible sources. */
export function upcomingCalendarMeeting(
  events: CalendarEvent[],
  now: number,
  previewMinutes: number,
) {
  return events
    .filter(
      (event) =>
        !event.start.date &&
        event.status !== "cancelled" &&
        !event.attendees.some(
          (attendee) => attendee.self && attendee.responseStatus === "declined",
        ) &&
        (event.conferenceUrl || event.attendees.some((attendee) => !attendee.self)) &&
        Date.parse(event.start.dateTime!) >= now &&
        Date.parse(event.start.dateTime!) <= now + previewMinutes * 60_000,
    )
    .sort((a, b) => Date.parse(a.start.dateTime!) - Date.parse(b.start.dateTime!))[0];
}
