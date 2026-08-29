import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { Hono } from "hono";

import { appErrorHandler, createApp } from "./";
import type { AppBindings } from "../shared/types";
import type { ZilobaseEditionExtension } from "../shared/types";

test("createApp registers every public feature route group", () => {
  const routes = createApp().routes.map(({ method, path }) => `${method} ${path}`);

  for (const expected of [
    "GET /.well-known/zilobase",
    "GET /health",
    "GET /ready",
    "GET /desktop",
    "GET /desktop/connected",
    "GET /desktop/authorize",
    "POST /desktop/authorize/consent",
    "POST /desktop/authorize/switch",
    "POST /api/auth/desktop/token",
    "POST /api/ai/chat",
    "GET /api/ai/operations/limits",
    "GET /api/ai/operations/turns",
    "GET /api/ai/operations/turns/:turnId/tools",
    "POST /api/keys",
    "GET /databases/:id",
    "POST /images/uploads",
    "POST /user-settings/profile/image/uploads",
    "GET /metadata/bookmark",
    "GET /pages",
    "POST /pages/:id/convert-to-teamspace",
    "POST /pages/:pageId/guest-invitations",
    "POST /page-guest-invitations/:invitationId/accept",
    "GET /search",
    "GET /session",
    "GET /workspaces/:workspaceId/access-targets",
    "GET /workspaces/:workspaceId/guests",
    "GET /workspaces/:workspaceId/teamspaces",
    "POST /workspaces/:workspaceId/teamspaces",
    "GET /workspaces/:workspaceId/teamspace-settings",
    "POST /workspaces/:workspaceId/teamspaces/:teamspaceId/archive",
    "PATCH /workspaces/:workspaceId/teamspaces/:teamspaceId/invite-link",
  ]) {
    assert.ok(routes.includes(expected), `missing route: ${expected}`);
  }
});

test("createApp keeps global middleware ahead of feature routes", () => {
  const routes = createApp().routes;
  const firstFeatureRoute = routes.findIndex(({ path }) => path !== "/*");

  assert.equal(firstFeatureRoute, 4);
  assert.deepEqual(
    routes.slice(0, firstFeatureRoute).map(({ path }) => path),
    ["/*", "/*", "/*", "/*"],
  );
});

test("createApp registers a compile-time edition after public routes", () => {
  const extension = createTestEditionExtension();
  const routes = createApp({ editionExtension: extension }).routes.map(
    ({ method, path }) => `${method} ${path}`,
  );

  assert.ok(routes.includes("GET /api/enterprise/license"));
  assert.ok(
    routes.indexOf("GET /api/enterprise/license") >
      routes.indexOf("GET /.well-known/zilobase"),
  );
});

function createTestEditionExtension(): ZilobaseEditionExtension {
  return {
    id: "enterprise",
    authPlugins: [],
    capabilities: ["sso"],
    async beforeMembershipGrant() {},
    async recordSecurityEvent() {},
    registerRoutes(app) {
      app.get("/api/enterprise/license", (c) => c.json({ status: "valid" }));
    },
  };
}

test("database availability failures use the stable 503 contract", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("requestId", "request-1");
    await next();
  });
  app.get("/database", () => {
    throw Object.assign(new Error("connection details must stay private"), {
      code: "53300",
    });
  });
  app.onError(appErrorHandler);

  const response = await app.request("/database");

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "5");
  assert.deepEqual(await response.json(), {
    code: "DATABASE_UNAVAILABLE",
    message: "The database is temporarily unavailable.",
  });
});

test("unexpected failures use a private stable 500 response", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("requestId", "request-2");
    await next();
  });
  app.get("/failure", () => {
    throw new Error("private implementation detail");
  });
  app.onError(appErrorHandler);

  const response = await app.request("/failure");

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error" });
  assert.deepEqual(JSON.parse(String(log.mock.calls[0]?.[0])), {
    error: "private implementation detail",
    event: "unhandled_request_error",
    requestId: "request-2",
    route: "/failure",
  });
  log.mockRestore();
});
