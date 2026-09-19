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
    "/mail/oauth/google/callback",
    "/mail/google/pubsub",
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
