import { test, expect, vi } from "vitest";
import { calendarSearchSchema, searchCalendarEvents } from "./search";
import type { CalendarRecord } from "@zilobase/features/calendar";
const calendar: CalendarRecord = {
  id: "c",
  bindingId: "b",
  name: "Calendar",
  primary: true,
  timeZone: "UTC",
  colorId: null,
  permissions: { read: true, write: false, owner: false, freeBusyOnly: false },
  defaultReminders: [],
};
test("search accepts unbounded and long date ranges without synchronization parameters", async () => {
  const events = vi.fn(async () => ({
    items: [],
    nextPageToken: "next",
    nextSyncToken: "must-not-store",
  }));
  const input = calendarSearchSchema.parse({ calendarId: "c", q: "design", pageToken: "prior" });
  expect(
    await searchCalendarEvents(input, { workspaceId: "w", bindingId: "b" }, calendar, { events }),
  ).toEqual({ events: [], nextPageToken: "next" });
  expect(events).toHaveBeenCalledWith("c", {
    q: "design",
    singleEvents: "true",
    maxResults: "100",
    orderBy: "startTime",
    pageToken: "prior",
  });
  expect(
    calendarSearchSchema.safeParse({
      ...input,
      start: "2020-01-01T00:00:00Z",
      end: "2030-01-01T00:00:00Z",
    }).success,
  ).toBe(true);
  expect(
    calendarSearchSchema.safeParse({
      ...input,
      start: "2030-01-01T00:00:00Z",
      end: "2020-01-01T00:00:00Z",
    }).success,
  ).toBe(false);
});
test("search rejects inaccessible and freebusy-only sources before contacting Google", async () => {
  const events = vi.fn(async () => ({ items: [] }));
  for (const record of [
    undefined,
    { ...calendar, permissions: { ...calendar.permissions, freeBusyOnly: true } },
    { ...calendar, permissions: { ...calendar.permissions, read: false } },
  ])
    await expect(
      searchCalendarEvents(
        { calendarId: "c", q: "secret" },
        { workspaceId: "w", bindingId: "b" },
        record,
        { events },
      ),
    ).rejects.toThrow("calendar_unavailable");
  expect(events).not.toHaveBeenCalled();
});
