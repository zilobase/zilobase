import { test, expect } from "vitest";
import { CalendarGateway, normalizeEvent } from "./gateway";
import { encryptCalendarSecret, decryptCalendarSecret } from "./credentials";
test("normalization preserves all-day end and moved recurrence identity", () => {
  const event = normalizeEvent(
    {
      id: "e",
      start: { date: "2026-09-09" },
      end: { date: "2026-09-10" },
      recurringEventId: "series",
      originalStartTime: { date: "2026-09-08" },
    },
    { workspaceId: "w", bindingId: "b", calendarId: "c" },
    "Asia/Kolkata",
  );
  expect(event.end).toEqual({ date: "2026-09-10" });
  expect(event.originalStartTime).toEqual({ date: "2026-09-08" });
});
test("gateway paginates calendars and scopes provider credentials", async () => {
  let calls = 0;
  const gateway = new CalendarGateway("secret", async (url, init) => {
    expect(String(url).startsWith("https://www.googleapis.com/calendar/v3/")).toBe(true);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    calls++;
    return Response.json({
      items: [{ id: String(calls), accessRole: calls === 1 ? "owner" : "reader" }],
      ...(calls === 1 ? { nextPageToken: "next" } : {}),
    });
  });
  const calendars = await gateway.calendars("binding");
  expect(calendars).toHaveLength(2);
  expect(calendars[1]!.permissions.write).toBe(false);
});
test("Calendar credentials reject a different account", async () => {
  const env = { CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
    context = { connectionId: "a", userId: "u", purpose: "refresh_token" as const };
  const secret = await encryptCalendarSecret(env, "refresh", context);
  expect(await decryptCalendarSecret(env, secret, context)).toBe("refresh");
  await expect(
    decryptCalendarSecret(env, secret, { ...context, connectionId: "b" }),
  ).rejects.toThrow();
});

test("conference failure remains distinct from a successfully saved event", () => {
  const event = normalizeEvent(
    {
      id: "meeting",
      start: { date: "2026-09-09" },
      end: { date: "2026-09-10" },
      conferenceData: { createRequest: { status: { statusCode: "failure" } } },
    },
    { workspaceId: "w", bindingId: "b", calendarId: "c" },
    "UTC",
  );
  expect(event.status).toBe("confirmed");
  expect(event.conferenceStatus).toBe("failure");
  expect(event.conferenceUrl).toBeUndefined();
});

test("range read cancellation reaches Google without changing mutation retry semantics", async () => {
  const controller = new AbortController();
  controller.abort();
  const gateway = new CalendarGateway("secret", async (_url, init) => {
    init?.signal?.throwIfAborted();
    return Response.json({});
  });
  await expect(gateway.events("c", {}, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  let calls = 0;
  const writes = new CalendarGateway("secret", async () => {
    calls++;
    return Response.json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, { status: 429 });
  });
  await expect(writes.request("/calendars/c/events", { method: "POST" })).rejects.toMatchObject({
    status: 429,
  });
  expect(calls).toBe(1);
});
