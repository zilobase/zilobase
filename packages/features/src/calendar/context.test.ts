import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarLocationUrl, upcomingCalendarMeeting } from "./context";
import type { CalendarEvent } from "./contracts";
const now = Date.parse("2026-09-10T09:00Z");
const meeting: CalendarEvent = {
  workspaceId: "w",
  bindingId: "b",
  calendarId: "c",
  eventId: "e",
  title: "Meeting",
  etag: "e",
  description: "",
  location: "",
  start: { dateTime: "2026-09-10T09:15Z", timeZone: "UTC" },
  end: { dateTime: "2026-09-10T10:00Z", timeZone: "UTC" },
  status: "confirmed",
  eventType: "default",
  attendees: [],
  conferenceUrl: "https://meet.google.com/abc-defg-hij",
  reminders: { useDefault: true },
  transparency: "opaque",
  visibility: "default",
  colorId: null,
  htmlLink: "",
};
test("preview horizon excludes declined, cancelled, all-day and distant meetings", () => {
  assert.equal(upcomingCalendarMeeting([meeting], now, 15), meeting);
  assert.equal(upcomingCalendarMeeting([meeting], now, 14), undefined);
  assert.equal(upcomingCalendarMeeting([meeting], now + 16 * 60_000, 15), undefined);
  for (const event of [
    { ...meeting, status: "cancelled" as const },
    { ...meeting, start: { date: "2026-09-10" } },
    {
      ...meeting,
      attendees: [{ email: "self@test.com", self: true, responseStatus: "declined" as const }],
    },
  ])
    assert.equal(upcomingCalendarMeeting([event], now, 60), undefined);
});
test("map preference keeps arbitrary location text inside an encoded search parameter", () => {
  const location = "javascript:alert(1)&q=other";
  assert.equal(new URL(calendarLocationUrl(location)).searchParams.get("query"), location);
  const apple = new URL(calendarLocationUrl(location, "apple"));
  assert.equal(apple.origin, "https://maps.apple.com");
  assert.equal(apple.searchParams.get("q"), location);
});
