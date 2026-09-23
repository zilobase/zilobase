import { expect, test } from "vitest";
import { inspectCalendarConfiguration } from "./configuration";
import { calendarMetric } from "@zilobase/features/calendar";
test("rollout configuration validates isolated credentials and runtime capabilities without exposing secrets", () => {
  const env = { CALENDAR_GOOGLE_CLIENT_ID: "client", CALENDAR_GOOGLE_CLIENT_SECRET: "secret", CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"), CALENDAR_WEBHOOK_URL: "https://api.example.test/calendar/google/webhook", BETTER_AUTH_URL: "https://api.example.test" };
  expect(inspectCalendarConfiguration(env, { background: true, realtime: true }).ready).toBe(true);
  expect(inspectCalendarConfiguration({ ...env, CALENDAR_TOKEN_ENCRYPTION_KEY: "invalid" }, { background: true, realtime: true }).ready).toBe(false);
  expect(inspectCalendarConfiguration(env, { background: false, realtime: true }).ready).toBe(false);
  expect(JSON.stringify(inspectCalendarConfiguration(env, { background: true, realtime: true }))).not.toContain("secret");
  expect(calendarMetric("range_latency", 12.4)).toEqual({ event: "calendar.range_latency", value: 12, outcome: "success" });
  expect(calendarMetric("range_latency", Infinity)).toBeNull();
});
