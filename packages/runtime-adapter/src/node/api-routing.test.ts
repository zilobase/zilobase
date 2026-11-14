import assert from "node:assert/strict";
import { test } from "vitest";

import { isNodeApiPath } from "./api-routing";

test("the combined Node runtime sends discovery, probes, and desktop auth to the API", () => {
  for (const path of [
    "/.well-known/zilobase",
    "/.well-known/oauth-authorization-server",
    "/.well-known/openid-configuration",
    "/clips",
    "/health",
    "/health/background",
    "/ready",
    "/api/auth/session",
    "/demo/bootstrap",
    "/desktop",
    "/desktop/authorize",
    "/page-layouts/resolve",
    "/page-guest-invitations/invite-1",
    "/automation-slack/oauth/callback",
  ]) {
    assert.equal(isNodeApiPath(path), true, path);
  }

  for (const path of ["/", "/assets/app.js", "/health-check"]) {
    assert.equal(isNodeApiPath(path), false, path);
  }
});

test("calendar callback paths reach Hono while the calendar screen remains a web route", () => {
  assert.equal(isNodeApiPath("/calendar/oauth/google/callback"), true);
  assert.equal(isNodeApiPath("/calendar/google/webhook"), true);
  assert.equal(isNodeApiPath("/calendar"), false);
});

test("Ask AI streams and history reach the API while its screen stays a web route", () => {
  for (const path of [
    "/ai/chat",
    "/ai/threads",
    "/ai/threads/thread-id",
    "/ai/sources/page/page-id",
    "/ai/sources/database/database-id",
    "/ai/runs/run-id/debug",
    "/ai/capabilities",
    "/ai/turns",
    "/ai/requests/request-id",
    "/ai/runs/run-id",
    "/ai/runs/run-id/events",
    "/ai/runs/run-id/cancel",
    "/ai/write",
  ])
    assert.equal(isNodeApiPath(path), true);
  assert.equal(isNodeApiPath("/ai"), false);
});
