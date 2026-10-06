import assert from "node:assert/strict";
import { Hono } from "hono";
import { test, vi } from "vitest";
import type { AppBindings } from "../../shared/types";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  record: null as null | { id: string; workspaceId: string },
  access: "none",
  mismatch: false,
  principalKind: "member" as "member" | "guest",
}));
vi.mock("../access", async (original) => ({
  ...(await original<typeof import("../access")>()),
  getWorkspacePrincipalKind: async () => state.principalKind,
  getPageRecord: async () => {
    state.calls.push("page");
    return state.record;
  },
  rejectActiveWorkspaceMismatch: async (c: import("hono").Context<AppBindings>) => {
    state.calls.push("workspace");
    return state.mismatch ? c.json({ error: "workspace mismatch" }, 409) : null;
  },
  getEffectivePageAccessInWorkspace: async () => {
    state.calls.push("access");
    return state.access;
  },
  canAccessPageInWorkspace: async () => {
    state.calls.push("access");
    return state.access !== "none";
  },
}));
vi.mock("./page-route-support", async (original) => ({
  ...(await original<typeof import("./page-route-support")>()),
  getPageIncludingDeleted: async () => state.record,
  getPagePropertyPayload: async () => {
    state.calls.push("payload");
    return { properties: [] };
  },
}));
import { pageRoutes } from "./page-routes";
import { pageContentRoutes } from "./page-content-routes";
import { pageSharingRoutes } from "./page-sharing-routes";

function app(authenticated: boolean) {
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
    .route("/content", pageContentRoutes)
    .route("/sharing", pageSharingRoutes);
}

test("page routes preserve identity, existence, permission and workspace-check ordering", async () => {
  for (const path of ["/content/page/properties", "/sharing/page/access"]) {
    state.calls = [];
    state.record = null;
    state.access = "none";
    state.mismatch = false;
    assert.equal((await app(false).request(path)).status, 401);
    assert.deepEqual(state.calls, []);
    assert.equal((await app(true).request(path)).status, 404);
    assert.deepEqual(state.calls, ["page"]);
    state.calls = [];
    state.record = { id: "page", workspaceId: "workspace" };
    assert.equal((await app(true).request(path)).status, 403);
    assert.deepEqual(state.calls, ["page", "access"]);
    state.calls = [];
    state.access = "full";
    state.mismatch = true;
    assert.equal((await app(true).request(path)).status, 409);
    assert.deepEqual(state.calls, ["page", "access", "workspace"]);
  }
  state.calls = [];
  state.mismatch = false;
  state.access = "view";
  state.record = { id: "page", workspaceId: "workspace" };
  const response = await app(true).request("/content/page/properties");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { properties: [], viewerType: "member" });
  assert.deepEqual(state.calls, ["page", "access", "workspace", "payload"]);
});

test("authorized page property reads declare their guest capability", async () => {
  state.record = { id: "page", workspaceId: "workspace" };
  state.access = "view";
  state.mismatch = false;
  state.principalKind = "guest";
  try {
    const response = await app(true).request("/content/page/properties");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { properties: [], viewerType: "guest" });
  } finally {
    state.principalKind = "member";
  }
});

test("OAuth page routes bind IDs, list queries and creation bodies to the granted workspace", async () => {
  const oauth = new Hono<AppBindings>();
  oauth.use("*", async (c, next) => {
    c.set("user", { id: "user" } as never);
    c.set("authMethod", "oauth");
    c.set("oauthScopes", ["pages.read", "pages.write"]);
    c.set("session", { activeWorkspaceId: "granted" } as never);
    await next();
  });
  oauth.route("/pages", pageRoutes);
  state.access = "full";
  state.mismatch = false;
  state.record = { id: "page", workspaceId: "other" };
  for (const path of ["/pages/page", "/pages/page/published", "/pages/page/properties"]) {
    assert.equal((await oauth.request(path)).status, 403);
  }
  assert.equal((await oauth.request("/pages?workspaceId=other")).status, 403);
  assert.equal(
    (
      await oauth.request("/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: "other" }),
      })
    ).status,
    403,
  );
  state.record.workspaceId = "granted";
  state.access = "none";
  assert.equal((await oauth.request("/pages/page/properties")).status, 403);
  state.access = "full";
  assert.equal((await oauth.request("/pages/page/properties")).status, 200);
});
