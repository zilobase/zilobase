import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { beforeAll, afterAll, test, expect, vi } from "vitest";
import * as schema from "../../infrastructure/database/schema";
import { runWithDb } from "../../infrastructure/database";
import { disconnectCalendarBinding, requireCalendarBinding } from "./connections/ownership";
const enabled = Boolean(process.env.CALENDAR_TEST_DATABASE_URL);
const pool = enabled ? new Pool({ connectionString: process.env.CALENDAR_TEST_DATABASE_URL }) : null;
const database = pool ? drizzle(pool, { schema }) : null;
const userId = randomUUID(), otherUser = randomUUID(), workspaceId = randomUUID();
const accountId = randomUUID(), secondAccount = randomUUID(), bindingId = randomUUID();
beforeAll(async () => {
  if (!database) return;
  await database.insert(schema.user).values([userId, otherUser].map(id => ({ id, name: "Calendar fixture", email: `${id}@example.test`, emailVerified: true })));
  await database.insert(schema.workspace).values({ id: workspaceId, name: "Calendar", slug: workspaceId });
  await database.insert(schema.member).values([userId, otherUser].map(id => ({ id: randomUUID(), organizationId: workspaceId, userId: id, role: "owner" })));
  await database.insert(schema.calendarAccount).values([accountId, secondAccount].map(id => ({ id, userId, googleSubject: id, email: `${id}@example.test`, secret: { ciphertext: "fixture", iv: "fixture", keyVersion: "v1" }, scopes: [] })));
  await database.insert(schema.calendarBinding).values({ id: bindingId, userId, workspaceId, accountId });
});
afterAll(async () => { await pool?.end() });
test.skipIf(!enabled)("bindings enforce owner identity and allow multiple accounts", async () => {
  await expect(database!.insert(schema.calendarBinding).values({ id: randomUUID(), userId: otherUser, workspaceId, accountId })).rejects.toThrow();
  await database!.insert(schema.calendarBinding).values({ id: randomUUID(), userId, workspaceId, accountId: secondAccount });
  await expect(runWithDb(database!, () => requireCalendarBinding(otherUser, workspaceId, bindingId))).rejects.toThrow("unavailable");
  expect((await runWithDb(database!, () => requireCalendarBinding(userId, workspaceId, bindingId))).account.id).toBe(accountId);
});
test.skipIf(!enabled)("disconnect removes only its own binding and last account", async () => {
  await runWithDb(database!, () => disconnectCalendarBinding(userId, workspaceId, bindingId));
  const rows = await database!.select().from(schema.calendarAccount);
  expect(rows.some(row => row.id === accountId)).toBe(false);
  expect(rows.some(row => row.id === secondAccount)).toBe(true);
});

import { beginCalendarOAuth, consumeCalendarOAuthAttempt, completeCalendarOAuth, CALENDAR_SCOPES } from "./provider/oauth";
import * as identityVerifier from "../../shared/security/google-id-token";
test.skipIf(!enabled)("OAuth commits verified accounts, rejects replay and missing scopes", async () => {
  const env = { CALENDAR_ENABLED: "true", CALENDAR_ENABLED_WORKSPACE_IDS: workspaceId, CALENDAR_GOOGLE_CLIENT_ID: "fixture", CALENDAR_GOOGLE_CLIENT_SECRET: "fixture", CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"), BETTER_AUTH_URL: "http://localhost:3000", CLIENT_URL: "http://localhost:1420" };
  const verified = vi.spyOn(identityVerifier, "verifyGoogleIdToken").mockResolvedValue({ subject: "oauth-fixture", email: "oauth@example.test" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "access", refresh_token: "refresh", id_token: "identity", scope: CALENDAR_SCOPES.join(" ") })));
  try {
    const url = new URL(await runWithDb(database!, () => beginCalendarOAuth(env, { userId, workspaceId, clientKind: "web" })));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = url.searchParams.get("state")!;
    await runWithDb(database!, () => completeCalendarOAuth(env, state, "code"));
    await expect(runWithDb(database!, () => completeCalendarOAuth(env, state, "code"))).rejects.toThrow("expired_oauth_attempt");
    const again = new URL(await runWithDb(database!, () => beginCalendarOAuth(env, { userId, workspaceId, clientKind: "desktop" })));
    const completed = await runWithDb(database!, () => completeCalendarOAuth(env, again.searchParams.get("state")!, "code"));
    expect(completed.workspaceId).toBe(workspaceId);
    expect(completed.clientKind).toBe("desktop");
    const oauthAccounts = (await database!.select().from(schema.calendarAccount)).filter(account => account.googleSubject === "oauth-fixture");
    expect(oauthAccounts).toHaveLength(1);
    expect((await database!.select().from(schema.calendarBinding)).filter(binding => binding.accountId === oauthAccounts[0]!.id)).toHaveLength(1);
    const cancel = new URL(await runWithDb(database!, () => beginCalendarOAuth(env, { userId, workspaceId, clientKind: "web" })));
    const cancelled = await runWithDb(database!, () => consumeCalendarOAuthAttempt(env, cancel.searchParams.get("state")!));
    expect(cancelled.workspaceId).toBe(workspaceId);
    await expect(runWithDb(database!, () => completeCalendarOAuth(env, cancel.searchParams.get("state")!, "code"))).rejects.toThrow("expired_oauth_attempt");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ access_token: "access", refresh_token: "refresh", id_token: "identity", scope: "openid email" })));
    const denied = new URL(await runWithDb(database!, () => beginCalendarOAuth(env, { userId, workspaceId, clientKind: "web" })));
    await expect(runWithDb(database!, () => completeCalendarOAuth(env, denied.searchParams.get("state")!, "code"))).rejects.toThrow("missing_calendar_scopes");
  } finally { verified.mockRestore(); vi.unstubAllGlobals() }
});

import { CalendarGateway } from "./provider/gateway";
import { advanceCalendarSync, refreshCalendarList } from "./sync/sync";
import { readCalendarRange } from "./sync/ranges";
test.skipIf(!enabled)("sync advances only final checkpoints and range cursors isolate accounts", async () => {
  const env = { CALENDAR_ENABLED: "true", CALENDAR_ENABLED_WORKSPACE_IDS: workspaceId };
  let eventCalls = 0;
  const gateway = new CalendarGateway("fixture", async url => {
    if (String(url).includes("calendarList")) return Response.json({ items: [{ id: "primary", accessRole: "owner" }] });
    eventCalls++;
    return Response.json({ items: [{ id: `e${eventCalls}`, start: { date: "2026-09-09" }, end: { date: "2026-09-10" } }], ...(eventCalls === 1 ? { nextPageToken: "page2" } : { nextSyncToken: "checkpoint" }) });
  });
  const [binding] = (await database!.select().from(schema.calendarBinding)).filter(row => row.accountId === secondAccount);
  await runWithDb(database!, () => refreshCalendarList(secondAccount, binding!.id, gateway));
  expect(await runWithDb(database!, () => advanceCalendarSync(env, secondAccount, "primary", gateway))).toBe(true);
  let [state] = await database!.select().from(schema.calendarProviderCalendar);
  expect(state!.syncToken).toBeNull(); expect(state!.revision).toBe(0);
  await runWithDb(database!, () => advanceCalendarSync(env, secondAccount, "primary", gateway));
  [state] = await database!.select().from(schema.calendarProviderCalendar);
  expect(state!.syncToken).toBe("checkpoint"); expect(state!.revision).toBe(1);
  let rangeCalls = 0;
  const occurrence = { id: "range-occurrence", summary: "Weekly event", start: { dateTime: "2026-09-10T19:30:00+05:30", timeZone: "Asia/Kolkata" }, end: { dateTime: "2026-09-10T20:30:00+05:30", timeZone: "Asia/Kolkata" } };
  const ranges = new CalendarGateway("fixture", async () => { rangeCalls++; return Response.json({ items: [occurrence], ...(rangeCalls === 1 ? { nextPageToken: "next" } : {}) }) });
  const input = { accountId: secondAccount, bindingId: binding!.id, workspaceId, calendarId: "primary", timeZone: "UTC", generation: 1, revision: 1, start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" };
  const first = await runWithDb(database!, () => readCalendarRange(input, ranges));
  expect(first.complete).toBe(false);
  await expect(runWithDb(database!, () => readCalendarRange({ ...input, accountId: "other", pageToken: first.nextPageToken! }, ranges))).rejects.toThrow("expired_range_cursor");
  const final = await runWithDb(database!, () => readCalendarRange({ ...input, revision: 9, pageToken: first.nextPageToken! }, ranges));
  expect(final.complete).toBe(true); expect(final.revision).toBe(1);
  expect(final.events).toHaveLength(1);
  expect(final.events[0]!.start).toEqual(occurrence.start);
  expect(final.events[0]!.end).toEqual(occurrence.end);
  expect(final.events[0]).not.toHaveProperty("pageToken");
  const { eventOverlaps, timedLayout } = await import("@zilobase/features/calendar");
  expect(eventOverlaps(final.events[0]!, input.start, input.end, "UTC")).toBe(true);
  expect(timedLayout(final.events, "2026-09-10", "UTC")[0]?.top).toBe(14 * 60);
});

import { mutateCalendarEvent, reconcileCalendarOperation } from "./events/mutations";
test.skipIf(!enabled)("creates deduplicate and uncertain delivery reconciles without replay", async () => {
  const [binding] = (await database!.select().from(schema.calendarBinding)).filter(row => row.accountId === secondAccount);
  const store = new Map(); let sends = 0, uncertain = false;
  const gateway = new CalendarGateway("fixture", async (url, options) => {
    if (options?.method === "POST") { sends++; const body = JSON.parse(String(options.body)); const event = { ...body, etag: "v1" }; store.set(body.id, event); if (uncertain) throw new TypeError("lost response"); return Response.json(event) }
    const row = store.get(new URL(String(url)).pathname.split("/").at(-1)); return row ? Response.json(row) : Response.json({}, { status: 404 });
  });
  const input = { userId, workspaceId, bindingId: binding!.id, calendarId: "primary", action: "create" as const, write: { operationId: randomUUID(), sendUpdates: "all" as const, event: { title: "Fixture event", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } } } };
  const first = await runWithDb(database!, () => mutateCalendarEvent({}, input, gateway));
  expect(first.status).toBe("succeeded");
  expect(await runWithDb(database!, () => mutateCalendarEvent({}, input, gateway))).toEqual(first); expect(sends).toBe(1);
  await expect(runWithDb(database!, () => mutateCalendarEvent({}, { ...input, write: { ...input.write, event: { ...input.write.event, title: "Changed" } } }, gateway))).rejects.toThrow("operation_identity_conflict");
  uncertain = true; const next = { ...input, write: { ...input.write, operationId: randomUUID() } };
  expect((await runWithDb(database!, () => mutateCalendarEvent({}, next, gateway))).status).toBe("ambiguous");
  expect((await runWithDb(database!, () => reconcileCalendarOperation({}, { userId, workspaceId, operationId: next.write.operationId }, gateway)))?.status).toBe("succeeded"); expect(sends).toBe(2);
  const conflict = { ...input, action: "update" as const, eventId: first.event!.eventId, write: { ...input.write, operationId: randomUUID(), etag: "old" } };
  await expect(runWithDb(database!, () => mutateCalendarEvent({}, conflict, gateway))).rejects.toThrow("event_changed"); expect(sends).toBe(2);
});

test.skipIf(!enabled)("a split recovers a committed successor after response loss without duplicate invitations", async () => {
  const [binding] = (await database!.select().from(schema.calendarBinding)).filter(row => row.accountId === secondAccount);
  const master = { id: "series", etag: "m1", summary: "Weekly", start: { date: "2026-09-01" }, end: { date: "2026-09-02" }, recurrence: ["RRULE:FREQ=WEEKLY"], organizer: { self: true, email: "owner@example.test" } };
  const occurrence = { ...master, id: "instance", etag: "i1", recurringEventId: "series", recurrence: undefined, originalStartTime: { date: "2026-09-08" }, start: { date: "2026-09-08" }, end: { date: "2026-09-09" } };
  const store = new Map<string, unknown>([[master.id, master], [occurrence.id, occurrence]]); let inserts = 0, updates = 0;
  const gateway = new CalendarGateway("fixture", async (url, options) => {
    const id = decodeURIComponent(new URL(String(url)).pathname.split("/").at(-1)!);
    if (options?.method === "PUT") { updates++; const body = JSON.parse(String(options.body)); store.set(id, { ...body, etag: "m2" }); return Response.json(store.get(id)) }
    if (options?.method === "POST") { inserts++; const body = JSON.parse(String(options.body)); expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet"); store.set(body.id, { ...body, etag: "t1" }); throw new TypeError("response lost after insert") }
    return store.has(id) ? Response.json(store.get(id)) : Response.json({}, { status: 404 });
  });
  const input = { userId, workspaceId, bindingId: binding!.id, calendarId: "primary", eventId: "instance", action: "update" as const, write: { operationId: randomUUID(), etag: "i1", sendUpdates: "all" as const, recurrenceScope: "following" as const, createMeet: true, event: { title: "Later meetings" } } };
  expect((await runWithDb(database!, () => mutateCalendarEvent({}, input, gateway))).status).toBe("ambiguous");
  const result = await runWithDb(database!, () => reconcileCalendarOperation({}, { userId, workspaceId, operationId: input.write.operationId }, gateway));
  expect(result?.status).toBe("succeeded"); expect(inserts).toBe(1); expect(updates).toBe(1);
  expect(await runWithDb(database!, () => mutateCalendarEvent({}, input, gateway))).toEqual(result);
});

test.skipIf(!enabled)("webhooks authenticate early callbacks, deduplicate replay, and persist dirty markers", async () => {
  const { acceptCalendarWebhook } = await import("./realtime/watches");
  const { sha256Hex } = await import("../../shared/crypto/sha256");
  const id = randomUUID(), token = randomUUID();
  await database!.insert(schema.calendarWatchChannel).values({ id, accountId: secondAccount, calendarId: "primary", tokenHash: await sha256Hex(token), expiresAt: new Date(Date.now() + 60000) });
  const headers = new Headers({ "x-goog-channel-id": id, "x-goog-channel-token": token, "x-goog-resource-id": "resource", "x-goog-message-number": "1" });
  const dispatched: unknown[] = [];
  const dispatch = async (accountId: string, calendarId: string | null) => { dispatched.push([accountId, calendarId]); };
  expect(await runWithDb(database!, () => acceptCalendarWebhook(headers, dispatch))).toBe(true);
  expect(await runWithDb(database!, () => acceptCalendarWebhook(headers, dispatch))).toBe(true);
  expect(dispatched).toEqual([[secondAccount, "primary"]]);
  headers.set("x-goog-message-number", "2");
  expect(await runWithDb(database!, () => acceptCalendarWebhook(headers, async () => { throw new Error("queue unavailable"); }))).toBe(true);
  headers.set("x-goog-resource-id", "spoofed"); expect(await runWithDb(database!, () => acceptCalendarWebhook(headers))).toBe(false);
  const [channel] = (await database!.select().from(schema.calendarWatchChannel)).filter(c => c.id === id);
  expect(channel!.messageNumber).toBe("2"); expect(channel!.dirtyAt).toBeInstanceOf(Date); expect(channel!.resourceId).toBe("resource");
});

test.skipIf(!enabled)("expired sync tokens preserve cached canonical events until recovery commits", async () => {
  const env = { CALENDAR_ENABLED: "true", CALENDAR_ENABLED_WORKSPACE_IDS: workspaceId };
  const before = await database!.select().from(schema.calendarEventRecord); expect(before.length).toBeGreaterThan(0);
  const expired = new CalendarGateway("fixture", async () => Response.json({}, { status: 410 }));
  await runWithDb(database!, () => advanceCalendarSync(env, secondAccount, "primary", expired));
  expect(await database!.select().from(schema.calendarEventRecord)).toHaveLength(before.length);
  const recovered = new CalendarGateway("fixture", async () => Response.json({ items: [], nextSyncToken: "recovered" }));
  await runWithDb(database!, () => advanceCalendarSync(env, secondAccount, "primary", recovered));
  expect(await database!.select().from(schema.calendarEventRecord)).toHaveLength(0);
});

test.skipIf(!enabled)("outbox retries failed publication and emits only currently owned scope metadata", async () => {
  const { drainCalendarOutbox } = await import("./realtime/outbox");
  const { runWithRuntimePorts } = await import("@zilobase/runtime-adapter/capabilities");
  const env = { CALENDAR_ENABLED: "true", CALENDAR_ENABLED_WORKSPACE_IDS: workspaceId };
  await database!.update(schema.calendarNotificationOutbox).set({ nextAttemptAt: new Date(0) });
  await runWithDb(database!, () => runWithRuntimePorts({ fanout: { publish: async () => { throw new Error("bus unavailable") } } as never }, () => drainCalendarOutbox(env)));
  const pending = await database!.select().from(schema.calendarNotificationOutbox);
  expect(pending.length).toBeGreaterThan(0); expect(pending.every(row => row.attempts === 1)).toBe(true);
  await database!.update(schema.calendarNotificationOutbox).set({ nextAttemptAt: new Date(0) });
  const published: unknown[] = [];
  await runWithDb(database!, () => runWithRuntimePorts({ fanout: { publish: async (_channel: string, event: unknown) => { published.push(event) } } as never }, () => drainCalendarOutbox(env)));
  expect(await database!.select().from(schema.calendarNotificationOutbox)).toHaveLength(0);
  expect(published.length).toBeGreaterThan(0);
  for (const event of published) expect(Object.keys(event as object).sort()).toEqual(["accountId", "bindingId", "calendarId", "generation", "revision", "userId", "workspaceId"]);
});

// A refresh reads the local catalog; it must not depend on a Google request.
test.skipIf(!enabled)("catalog refresh is mounted, scoped, and provider-independent", async () => {
  const { Hono } = await import("hono");
  const { calendarSyncRoutes } = await import("./sync/routes");
  const { CalendarAccessError } = await import("./connections/ownership");
  const [binding] = (await database!.select().from(schema.calendarBinding)).filter(row => row.accountId === secondAccount);
  const users = await database!.select().from(schema.user);
  let identity = userId;
  const app = new Hono<import("../../shared/types").AppBindings>();
  app.use("*", async (c, next) => { c.set("user", users.find(user => user.id === identity)!); await next(); });
  app.onError((error, c) => c.json({ error: error.message }, error instanceof CalendarAccessError ? error.status : 500));
  app.route("/workspaces/:workspaceId/calendar", calendarSyncRoutes);
  const fetchSpy = vi.fn(() => { throw new Error("Catalog must not call Google"); });
  vi.stubGlobal("fetch", fetchSpy);
  try {
    const path = `/workspaces/${workspaceId}/calendar/connections/${binding!.id}/catalog`;
    const response = await runWithDb(database!, async () => app.request(path));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.calendars).toEqual(expect.arrayContaining([expect.objectContaining({ id: "primary", bindingId: binding!.id })]));
    identity = otherUser;
    expect((await runWithDb(database!, async () => app.request(path))).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});


test.skipIf(!enabled)("event capabilities reject unsupported writes before provider delivery", async () => {
  const [binding] = (await database!.select().from(schema.calendarBinding)).filter(row => row.accountId === secondAccount);
  let writes = 0;
  const raw = { id: "capability-event", etag: "v1", eventType: "focusTime", organizer: { self: true, email: "owner@example.test" }, start: { date: "2026-09-09" }, end: { date: "2026-09-10" } };
  const gateway = new CalendarGateway("fixture", async (_url, options) => {
    if (options?.method && options.method !== "GET") writes++;
    return Response.json(raw);
  });
  const input = { userId, workspaceId, bindingId: binding!.id, calendarId: "primary", eventId: raw.id, action: "update" as const, write: { operationId: randomUUID(), etag: "v1", sendUpdates: "none" as const, event: { title: "Denied" } } };
  await expect(runWithDb(database!, () => mutateCalendarEvent({}, input, gateway))).rejects.toThrow("specialized_event_read_only");
  expect(writes).toBe(0);
  raw.eventType = "default";
  raw.organizer.self = false;
  await expect(runWithDb(database!, () => mutateCalendarEvent({}, { ...input, action: "move", destination: "primary", write: { ...input.write, operationId: randomUUID() } }, gateway))).rejects.toThrow("event_move_not_allowed");
  expect(writes).toBe(0);
});


import { personalCalendarSources } from "./connections/catalog";
test.skipIf(!enabled)("personal sources isolate owners, deduplicate accounts and reject expired memberships", async () => {
  const remoteWorkspace = randomUUID(), expiredWorkspace = randomUUID(), remoteAccount = randomUUID(), privateAccount = randomUUID();
  await database!.insert(schema.workspace).values([remoteWorkspace, expiredWorkspace].map(id => ({ id, name: "Other workspace", slug: id })));
  await database!.insert(schema.member).values([
    { id: randomUUID(), organizationId: remoteWorkspace, userId, role: "member" },
    { id: randomUUID(), organizationId: remoteWorkspace, userId: otherUser, role: "member" },
    { id: randomUUID(), organizationId: expiredWorkspace, userId, role: "temporary", accessExpiresAt: new Date(0) },
  ]);
  await database!.insert(schema.calendarAccount).values([
    { id: remoteAccount, userId, googleSubject: remoteAccount, email: "remote@example.test", secret: { ciphertext: "fixture", iv: "fixture", keyVersion: "v1" }, scopes: [] },
    { id: privateAccount, userId: otherUser, googleSubject: privateAccount, email: "private@example.test", secret: { ciphertext: "fixture", iv: "fixture", keyVersion: "v1" }, scopes: [] },
  ]);
  await database!.insert(schema.calendarBinding).values([
    { id: randomUUID(), userId, workspaceId: remoteWorkspace, accountId: secondAccount },
    { id: randomUUID(), userId, workspaceId: remoteWorkspace, accountId: remoteAccount },
    { id: randomUUID(), userId: otherUser, workspaceId: remoteWorkspace, accountId: privateAccount },
    { id: randomUUID(), userId, workspaceId: expiredWorkspace, accountId: remoteAccount },
  ]);
  const env = { CALENDAR_ENABLED: "true", CALENDAR_ENABLED_WORKSPACE_IDS: "*" };
  const sources = await runWithDb(database!, () => personalCalendarSources(env, userId, workspaceId));
  expect(sources.filter(source => source.accountId === secondAccount)).toHaveLength(1);
  expect(sources.find(source => source.accountId === secondAccount)?.workspaceId).toBe(workspaceId);
  expect(sources.find(source => source.accountId === remoteAccount)?.workspaceId).toBe(remoteWorkspace);
  expect(sources.some(source => source.accountId === privateAccount || source.workspaceId === expiredWorkspace)).toBe(false);
  expect(JSON.stringify(sources)).not.toContain("ciphertext");
  const restricted = await runWithDb(database!, () => personalCalendarSources({ ...env, CALENDAR_ENABLED_WORKSPACE_IDS: workspaceId }, userId, workspaceId));
  expect(restricted.some(source => source.accountId === remoteAccount)).toBe(false);
  await expect(runWithDb(database!, () => personalCalendarSources(env, userId, expiredWorkspace))).rejects.toThrow("Workspace access required");
});
