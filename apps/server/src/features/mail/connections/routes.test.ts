import assert from "node:assert/strict";
import { Hono } from "hono";
import { beforeEach, test, vi } from "vitest";
import type { AppBindings } from "../../../shared/types";
const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  member: true,
  returnTo: null as string | null,
  completed: {
    clientKind: "web",
    connectionId: "connection",
    returnTo: null as string | null,
  },
  error: null as Error | null,
  calls: [] as string[],
}));
vi.mock("../../../infrastructure/database", async (original) => ({
  ...(await original<typeof import("../../../infrastructure/database")>()),
  runWithDbEnv: async (_env: unknown, run: () => unknown) => run(),
  db: {
    select: () => {
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: () => query,
        limit: async () => state.rows,
      };
      return query;
    },
  },
}));
vi.mock("../route-support", async (original) => ({
  ...(await original<typeof import("../route-support")>()),
  workspaceIdFromContext: () => "workspace",
  requireWorkspaceMember: async () =>
    state.member ? { role: "member" } : new Response(null, { status: 403 }),
}));
vi.mock("../provider/google-oauth", async (original) => ({
  ...(await original<typeof import("../provider/google-oauth")>()),
  gmailProviderConfigured: () => true,
  gmailChatReturnPath: async (_value: string, consume: boolean) => {
    if (consume) state.calls.push("consume");
    return state.returnTo;
  },
  completeGmailOauth: async () => {
    state.calls.push("complete");
    if (state.error) throw state.error;
    return state.completed;
  },
}));
vi.mock("../../../shared/config/config", async (original) => ({
  ...(await original<typeof import("../../../shared/config/config")>()),
  getCanonicalWebOrigin: () => "https://app.example.test",
}));
vi.mock("../mail-metrics", () => ({
  recordMailMetric: async () => {
    state.calls.push("metric");
  },
}));
vi.mock("../../instance/service", () => ({
  getZilobaseDiscoveryDocument: async () => ({
    apiOrigin: "https://api.example.test",
    instanceId: "instance",
  }),
}));
import { mailConnectionRoutes, mailProviderCallbackRoutes } from "./routes";
function app(authenticated = true) {
  return new Hono<AppBindings>()
    .use("*", async (c, next) => {
      if (authenticated)
        c.set("user", {
          id: "user",
          name: "User",
          email: "user@example.test",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
        });
      await next();
    })
    .route("/", mailConnectionRoutes)
    .route("/", mailProviderCallbackRoutes);
}
beforeEach(() => {
  state.rows = [];
  state.member = true;
  state.returnTo = null;
  state.completed = {
    clientKind: "web",
    connectionId: "connection",
    returnTo: null,
  };
  state.error = null;
  state.calls = [];
});
test("mail connection status preserves auth, membership and disconnected defaults", async () => {
  assert.equal((await app(false).request("/connection")).status, 401);
  state.member = false;
  assert.equal((await app().request("/connection")).status, 403);
  state.member = true;
  assert.deepEqual(await (await app().request("/connection")).json(), {
    accountId: null,
    bindingId: null,
    connectionId: null,
    email: null,
    lastErrorCode: null,
    mailboxReady: false,
    mailboxRevision: 0,
    providerConfigured: true,
    pushAvailable: false,
    status: "disconnected",
    watchExpiresAt: null,
    workspaceId: "workspace",
  });
  state.rows = [
    {
      account: {
        id: "account",
        email: "mail@example.test",
        status: "connected",
        watchExpiresAt: new Date("2030-01-01"),
      },
      binding: { id: "binding" },
      committedRevision: 7,
      recentReadyAt: new Date("2029-01-01"),
    },
  ];
  const result = await (await app().request("/connection")).json();
  assert.equal(result.accountId, "account");
  assert.equal(result.bindingId, "binding");
  assert.equal(result.mailboxRevision, 7);
  assert.equal(result.watchExpiresAt, "2030-01-01T00:00:00.000Z");
});
test("OAuth callbacks handle cancellation without completing a provider exchange", async () => {
  const response = await app(false).request("/oauth/google/callback?state=state&error=denied");
  assert.equal(response.status, 400);
  assert.match(await response.text(), /cancelled/);
  assert.match(response.headers.get("content-security-policy")!, /default-src 'none'/);
  assert.deepEqual(state.calls, ["metric", "consume"]);
});
test("OAuth callbacks preserve browser and desktop destinations with controlled provider results", async () => {
  const browser = await app(false).request("/oauth/google/callback?state=state&code=code");
  assert.equal(browser.status, 302);
  assert.equal(browser.headers.get("location"), "https://app.example.test/mail?connection=success");
  state.completed.clientKind = "desktop";
  const desktop = await app(false).request("/oauth/google/callback?state=state&code=code");
  assert.equal(desktop.status, 200);
  assert.match(await desktop.text(), /zilobase:\/\/open\?/);
  state.error = new Error("Provider unavailable");
  const failed = await app(false).request("/oauth/google/callback?state=state&code=code");
  assert.equal(failed.status, 500);
  assert.match(await failed.text(), /Provider unavailable/);
});
