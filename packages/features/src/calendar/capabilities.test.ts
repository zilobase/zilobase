import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarCapability } from "./capabilities";

const owner = { read: true, write: true, owner: true, freeBusyOnly: false };
const reader = { ...owner, write: false, owner: false };
const event = { eventType: "default", organizer: { self: true }, attendees: [{ self: true }] };

test("ordinary events retain CRUD and organizer operations", () => {
  for (const operation of [
    "create",
    "update",
    "delete",
    "duplicate",
    "rsvp",
    "move",
    "following",
  ] as const) {
    assert.equal(calendarCapability(operation, owner, event).allowed, true, operation);
  }
});
test("read-only attendees can RSVP but cannot edit", () => {
  assert.equal(calendarCapability("rsvp", reader, event).allowed, true);
  for (const operation of ["create", "update", "delete", "duplicate", "move", "following"] as const)
    assert.equal(calendarCapability(operation, reader, event).allowed, false);
  assert.equal(calendarCapability("rsvp", reader, { attendees: [] }).allowed, false);
});
test("missing or free-busy-only permissions never permit writes", () => {
  for (const operation of [
    "create",
    "update",
    "delete",
    "duplicate",
    "rsvp",
    "move",
    "following",
  ] as const) {
    assert.equal(calendarCapability(operation, undefined, event).allowed, false);
    assert.equal(
      calendarCapability(operation, { ...owner, freeBusyOnly: true }, event).allowed,
      false,
    );
  }
});
test("specialized and cancelled events explain why they cannot be changed", () => {
  for (const eventType of [
    "focusTime",
    "outOfOffice",
    "birthday",
    "workingLocation",
    "fromGmail",
    "unknown",
  ]) {
    const capability = calendarCapability("update", owner, { ...event, eventType });
    assert.equal(capability.allowed, false);
    if (!capability.allowed) assert.match(capability.reason, /Google Calendar/);
  }
  assert.equal(calendarCapability("rsvp", owner, { ...event, status: "cancelled" }).allowed, false);
});
test("series and move operations require appropriate organizer context", () => {
  assert.equal(
    calendarCapability("move", owner, { ...event, organizer: { self: false } }).allowed,
    false,
  );
  assert.equal(
    calendarCapability("following", owner, { ...event, organizer: { self: false } }).allowed,
    false,
  );
  assert.equal(
    calendarCapability("move", owner, { ...event, recurringEventId: "series" }).allowed,
    false,
  );
  assert.equal(
    calendarCapability("update", owner, { ...event, recurringEventId: "series" }).allowed,
    true,
  );
});
