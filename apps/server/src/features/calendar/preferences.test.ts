import { test, expect } from "vitest";
import { defaultCalendarPreferences } from "@zilobase/features/calendar";
import { calendarPreferencesSchema } from "./preferences";
test("preferences validate IANA zones, week start and secondary axis limits", () => {
  expect(calendarPreferencesSchema.parse(defaultCalendarPreferences("Asia/Kolkata")).timeZone).toBe("Asia/Kolkata");
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), timeZone: "invalid/zone" }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), timeZoneColumns: [] }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), weekStartsOn: 7 }).success).toBe(false);
});
test("preferences require the current shape and reject unsupported colors", () => {
  const incomplete = { ...defaultCalendarPreferences() } as Record<string, unknown>;
  delete incomplete.calendarColors;
  expect(calendarPreferencesSchema.safeParse(incomplete).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), calendarColors: { calendar: "pink" } }).success).toBe(false);
  expect(calendarPreferencesSchema.parse({ ...defaultCalendarPreferences(), calendarColors: { calendar: "green" }, removedCalendarKeys: ["calendar"] }).calendarColors.calendar).toBe("green");
});
test("preferences reject unsupported views", () => {
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), view: "agenda" }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), view: "invalid" }).success).toBe(false);
});

test("source organization fields bound saved keys", () => {
  const parsed = calendarPreferencesSchema.parse(defaultCalendarPreferences());
  expect(parsed.accountOrder).toEqual([]);
  expect(parsed.collapsedAccountIds).toEqual([]);
  expect(calendarPreferencesSchema.safeParse({ ...parsed, calendarOrder: Array(501).fill("a") }).success).toBe(false);
});

test("grid density is required and enforces usable bounds", () => {
  const incomplete = { ...defaultCalendarPreferences() } as Record<string, unknown>;
  delete incomplete.hourHeight;
  expect(calendarPreferencesSchema.safeParse(incomplete).success).toBe(false);
  for (const hourHeight of [32, 48, 120]) expect(calendarPreferencesSchema.parse({ ...defaultCalendarPreferences(), hourHeight }).hourHeight).toBe(hourHeight);
  for (const hourHeight of [0, 31, 121, 48.5]) expect(calendarPreferencesSchema.safeParse({ ...defaultCalendarPreferences(), hourHeight }).success).toBe(false);
});

test("general preferences default safely and reject unsupported options", () => {
  const parsed = calendarPreferencesSchema.parse(defaultCalendarPreferences());
  expect(parsed).toMatchObject({ todayAlignment: "week", mapsProvider: "google", meetingPreviewMinutes: 15 });
  expect(calendarPreferencesSchema.safeParse({ ...parsed, mapsProvider: "arbitrary" }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...parsed, meetingPreviewMinutes: -1 }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...parsed, meetingPreviewMinutes: 1441 }).success).toBe(false);
});

test("labeled zones require the current representation and keep ordered axes consistent", () => {
  const current = defaultCalendarPreferences("Asia/Kolkata");
  const columns = [{ zone: "Europe/London", label: "Team" }, { zone: "Asia/Kolkata", label: "Home" }, { zone: "America/New_York", label: "Client" }, { zone: "UTC", label: "UTC" }];
  const promoted = calendarPreferencesSchema.parse({ ...current, timeZoneColumns: columns });
  expect(promoted.timeZone).toBe("Europe/London");
  expect(calendarPreferencesSchema.safeParse({ ...current, timeZoneColumns: [...columns, { zone: "Asia/Tokyo", label: "Tokyo" }] }).success).toBe(false);
  expect(calendarPreferencesSchema.safeParse({ ...current, timeZoneColumns: [columns[0], columns[0]] }).success).toBe(false);
});
