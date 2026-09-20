import { dispatchCalendarWebhook } from "./background";
import { personalCalendarSources } from "./connections/catalog";
import { inspectCalendarConfiguration } from "./configuration";
import { getRuntimeAdapter } from "../../infrastructure/runtime/runtime-adapter";
import { calendarRealtimeRoutes } from "./realtime/routes";
import { acceptCalendarWebhook, stopCalendarWatches } from "./realtime/watches";
import { calendarEventRoutes } from "./events/routes";
import { calendarSyncRoutes } from "./sync/routes";
import { calendarPreferenceRoutes } from "./preferences";
import { calendarConnectionReturnPath } from "@zilobase/features/calendar";
import { Hono, type Context } from "hono";
import { Schema } from "effect";
import { and, eq } from "drizzle-orm";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { calendarAccount, calendarBinding } from "../../infrastructure/database/schema";
import { isCalendarFeatureEnabled, getCanonicalWebOrigin, getStringEnv } from "../../shared/config/config";
import type { AppBindings } from "../../shared/types";
import { requireCalendarMembership, CalendarAccessError, requireCalendarBinding, disconnectCalendarBinding } from "./connections/ownership";
import { beginCalendarOAuth, consumeCalendarOAuthAttempt, completeCalendarOAuth, createCalendarGateway } from "./provider/oauth";
import { CalendarProviderError } from "./provider/gateway";
import { getZilobaseDiscoveryDocument } from "../instance/service";
export const calendarRoutes = new Hono<AppBindings>();
export const calendarProviderRoutes = new Hono<AppBindings>();
for (const app of [calendarRoutes, calendarProviderRoutes]) {
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store, max-age=0"); c.header("Referrer-Policy", "no-referrer"); c.header("X-Content-Type-Options", "nosniff");
    if (!isCalendarFeatureEnabled(c.env, c.req.param("workspaceId"))) return c.json({ message: "Not found." }, 404);
    await next();
  });
  app.onError((error, c) => {
    if (Schema.isSchemaError(error)) return c.json({ message: "Invalid calendar request." }, 400);
    if (error instanceof CalendarAccessError) return c.json({ message: error.message }, error.status);
    if (error instanceof CalendarProviderError) return c.json({ message: error.code, code: error.code, retryAfterMs: error.retryAfterMs }, calendarErrorStatus(error.status));
    return c.json({ message: "Calendar request failed." }, 500);
  });
}
calendarRoutes.use("*", async (c, next) => {
  const user = c.get("user"); if (!user) return c.json({ message: "Authentication required." }, 401);
  await requireCalendarMembership(user.id, c.req.param("workspaceId")!); await next();
});
calendarRoutes.get("/connections", async c => {
  const rows = await db.select({ binding: calendarBinding, account: calendarAccount }).from(calendarBinding).innerJoin(calendarAccount, eq(calendarAccount.id, calendarBinding.accountId)).where(and(eq(calendarBinding.userId, c.get("user")!.id), eq(calendarBinding.workspaceId, c.req.param("workspaceId")!)));
  return c.json({ connections: rows.map(({ binding, account }) => ({ bindingId: binding.id, workspaceId: binding.workspaceId, accountId: account.id, email: account.email, status: account.status, pushAvailable: false })), providerConfigured: Boolean(getStringEnv(c.env, "CALENDAR_GOOGLE_CLIENT_ID") && getStringEnv(c.env, "CALENDAR_GOOGLE_CLIENT_SECRET") && getStringEnv(c.env, "CALENDAR_TOKEN_ENCRYPTION_KEY")) });
});
calendarRoutes.get("/sources", async c => c.json({
  connections: await personalCalendarSources(c.env, c.get("user")!.id, c.req.param("workspaceId")!),
  providerConfigured: Boolean(getStringEnv(c.env, "CALENDAR_GOOGLE_CLIENT_ID") && getStringEnv(c.env, "CALENDAR_GOOGLE_CLIENT_SECRET") && getStringEnv(c.env, "CALENDAR_TOKEN_ENCRYPTION_KEY")),
}));
const GoogleOAuthStart = Schema.Struct({
  client: Schema.Literals(["web", "desktop"]),
});

calendarRoutes.post("/connections/google/start", async c => {
  const body = Schema.decodeUnknownSync(GoogleOAuthStart)(await c.req.json());
  return c.json({ authorizationUrl: await beginCalendarOAuth(c.env, { userId: c.get("user")!.id, workspaceId: c.req.param("workspaceId")!, clientKind: body.client }) });
});
calendarRoutes.delete("/connections/:bindingId", async c => {
  const owned = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  const bindings = await db.select().from(calendarBinding).where(eq(calendarBinding.accountId, owned.account.id));
  if (bindings.length === 1) { try { await stopCalendarWatches(owned.account.id, await createCalendarGateway(c.env, owned.account)) } catch { /* Local disconnect still revokes access; abandoned watches expire. */ } }
  await disconnectCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId")); return c.json({ disconnected: true });
});
calendarRoutes.get("/connections/:bindingId/calendars", async c => {
  const row = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  return c.json({ calendars: await (await createCalendarGateway(c.env, row.account)).calendars(row.binding.id) });
});
calendarProviderRoutes.get("/oauth/google/callback", async c => {
  const state = c.req.query("state"); if (!state) return c.json({ message: "Missing OAuth state." }, 400);
  if (c.req.query("error")) {
    const attempt = await runWithDbEnv(c.env, () => consumeCalendarOAuthAttempt(c.env, state));
    return finishCalendarConnection(c, attempt, "cancelled");
  }
  const code = c.req.query("code"); if (!code) return c.json({ message: "Missing OAuth code." }, 400);
  const result = await runWithDbEnv(c.env, () => completeCalendarOAuth(c.env, state, code));
  return finishCalendarConnection(c, result, "success");
});

calendarRoutes.route("/", calendarPreferenceRoutes);

calendarRoutes.route("/", calendarSyncRoutes);

calendarRoutes.route("/", calendarEventRoutes);

calendarRoutes.route("/", calendarRealtimeRoutes);
calendarProviderRoutes.post("/google/webhook", async c => {
 const accepted = await runWithDbEnv(c.env, () => acceptCalendarWebhook(c.req.raw.headers, (accountId, calendarId) => dispatchCalendarWebhook(c.env, accountId, calendarId)));
 return c.body(null, accepted ? 204 : 403);
});

calendarRoutes.get("/configuration", c => { const runtime = getRuntimeAdapter(); return c.json(inspectCalendarConfiguration(c.env, { background: Boolean(c.get("runtimePorts")?.jobs), realtime: Boolean(runtime.publishCalendarNotification) })) });

function calendarErrorStatus(status: number): 400 | 401 | 403 | 404 | 409 | 412 | 429 | 502 { const supported = [400, 401, 403, 404, 409, 412, 429] as const; return supported.find(code => code === status) ?? 502 }

async function finishCalendarConnection(c: Context<AppBindings>, attempt: { clientKind: string; workspaceId: string }, outcome: "success" | "cancelled") {
  const path = calendarConnectionReturnPath(attempt.workspaceId, outcome);
  if (attempt.clientKind !== "desktop") return c.redirect(new URL(path, getCanonicalWebOrigin(c.env)).toString());
  const discovery = await getZilobaseDiscoveryDocument(c.env), url = new URL("zilobase://open");
  url.search = new URLSearchParams({ instance: discovery.instanceId, server: discovery.apiOrigin, path }).toString();
  const safe = url.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const title = outcome === "success" ? "Calendar connected" : "Calendar connection cancelled";
  c.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  return c.html(`<!doctype html><title>${title}</title><p>${title}.</p><a href="${safe}">Open Zilobase Desktop</a>`);
}
