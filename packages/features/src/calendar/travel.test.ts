import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultCalendarPreferences } from "./model";
import { calendarTravelPreferences } from "./travel";
test("travel projection preserves saved preferences and restores by identity", () => {
  const saved = { ...defaultCalendarPreferences("UTC"), timeZoneColumns: [{ zone: "UTC", label: "Home" }, { zone: "Asia/Tokyo", label: "Team" }] };
  const before = JSON.stringify(saved);
  const travel = calendarTravelPreferences(saved, "Asia/Tokyo");
  assert.equal(travel.timeZone, "Asia/Tokyo");
  assert.equal(travel.timeZoneColumns[0]!.label, "Team");
  assert.equal(JSON.stringify(saved), before);
  assert.equal(calendarTravelPreferences(saved, null), saved);
  assert.throws(() => calendarTravelPreferences(saved, "invalid/zone"));
});
test("travel aliases reuse the saved column instead of duplicating a time zone", () => {
  const home = { ...defaultCalendarPreferences("Asia/Kolkata"), timeZoneColumns: [{ zone: "Asia/Kolkata", label: "Home" }] };
  assert.equal(calendarTravelPreferences(home, "Asia/Calcutta"), home);
  const saved = { ...defaultCalendarPreferences("UTC"), timeZoneColumns: [{ zone: "UTC", label: "Office" }, { zone: "Asia/Kolkata", label: "Home" }] };
  const travel = calendarTravelPreferences(saved, "Asia/Calcutta");
  assert.equal(travel.timeZoneColumns.length, 2);
  assert.equal(travel.timeZone, "Asia/Kolkata");
  assert.equal(travel.timeZoneColumns[0]!.label, "Home");
});
