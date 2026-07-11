import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "./app";

test("createApp registers every public feature route group", () => {
  const routes = createApp().routes.map(({ method, path }) => `${method} ${path}`);

  for (const expected of [
    "GET /health",
    "POST /api/ai/chat",
    "POST /api/keys",
    "GET /databases/:id",
    "POST /images/uploads",
    "GET /metadata/bookmark",
    "GET /pages",
    "GET /search",
    "GET /session",
    "GET /workspaces/:workspaceId/access-targets",
  ]) {
    assert.ok(routes.includes(expected), `missing route: ${expected}`);
  }
});

test("createApp keeps global middleware ahead of feature routes", () => {
  const routes = createApp().routes;
  const firstFeatureRoute = routes.findIndex(({ path }) => path !== "/*");

  assert.equal(firstFeatureRoute, 3);
  assert.deepEqual(
    routes.slice(0, firstFeatureRoute).map(({ path }) => path),
    ["/*", "/*", "/*"],
  );
});
