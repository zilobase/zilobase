import { expect, test } from "vitest";
import { coveredWatchExpiry } from "./watch-health";
test("healthy push requires active list and event watches and uses the earliest coverage expiry", () => {
  const list = { calendarId: null, status: "active", expiresAt: new Date(200000) };
  const event = { calendarId: "primary", status: "active", expiresAt: new Date(180000) };
  expect(coveredWatchExpiry([null, "primary"], [list], 100000)).toBeNull();
  expect(
    coveredWatchExpiry([null, "primary"], [list, { ...event, status: "pending" }], 100000),
  ).toBeNull();
  expect(coveredWatchExpiry([null, "primary"], [list, event], 100000)).toBe(
    event.expiresAt.toISOString(),
  );
  expect(coveredWatchExpiry([null, "primary"], [list, event], 180000)).toBeNull();
  expect(
    coveredWatchExpiry(
      [null, "primary"],
      [list, event, { ...event, expiresAt: new Date(210000) }],
      100000,
    ),
  ).toBe(list.expiresAt.toISOString());
});
