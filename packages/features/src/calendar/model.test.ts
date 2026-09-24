import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarApiBasePath, calendarEventKey, defaultCalendarPreferences } from "./model";
test("calendar identity isolates accounts and escapes workspace routes", () => {
  const identity = { workspaceId: "w", bindingId: "a", calendarId: "c", eventId: "e" };
  assert.notEqual(calendarEventKey(identity), calendarEventKey({ ...identity, bindingId: "b" }));
  assert.equal(calendarApiBasePath("a/b"), "/workspaces/a%2Fb/calendar");
  assert.throws(() => calendarApiBasePath(""));
  const first = defaultCalendarPreferences();
  first.hiddenCalendarKeys.push("x");
  assert.deepEqual(defaultCalendarPreferences().hiddenCalendarKeys, []);
});
