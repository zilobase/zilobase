import assert from "node:assert/strict";
import { Hono } from "hono";
import { test } from "vitest";

import type { AppBindings } from "../../shared/types";
import { getHostedDemoSeedDefinition } from "./seed";
import { isHostedDemoEnabled, isHostedDemoRequest } from "./request";
import { demoWriteGuard } from "./write-guard";

test("hosted demo identity is disabled unless explicitly enabled and marked", () => {
  const marked = new Headers({ "x-zilobase-demo": "1" });
  assert.equal(isHostedDemoEnabled({} as AppBindings["Bindings"]), false);
  assert.equal(isHostedDemoRequest({} as AppBindings["Bindings"], marked), false);
  assert.equal(
    isHostedDemoRequest(
      { ZILOBASE_DEMO_ENABLED: "true" } as AppBindings["Bindings"],
      new Headers(),
    ),
    false,
  );
  assert.equal(
    isHostedDemoRequest(
      { ZILOBASE_DEMO_ENABLED: "true" } as AppBindings["Bindings"],
      marked,
    ),
    true,
  );
});

test("hosted demo write guard returns the stable read-only contract", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("authMethod", "demo");
    await next();
  });
  app.use("*", demoWriteGuard);
  app.get("/resource", (c) => c.json({ ok: true }));
  app.get("/api/auth/callback/provider", (c) => c.json({ mutated: true }));
  app.all("*", (c) => c.json({ mutated: true }));

  assert.equal((await app.request("/resource")).status, 200);
  for (const [path, method] of [
    ["/pages/demo-page", "PATCH"],
    ["/databases/demo-database/rows/demo-row", "DELETE"],
    ["/user-settings", "PATCH"],
    ["/images/upload", "POST"],
    ["/ai/conversations/demo/messages", "POST"],
    ["/api/auth/sign-out", "POST"],
  ]) {
    const blocked = await app.request(path, { method });
    assert.equal(blocked.status, 403, `${method} ${path}`);
    assert.deepEqual(await blocked.json(), {
      code: "DEMO_READ_ONLY",
      error: "Changes are disabled in the hosted demo.",
    });
  }
  assert.equal(
    (await app.request("/api/auth/callback/provider")).status,
    403,
  );
});

test("hosted demo fixture uses deterministic fictional content", () => {
  const seed = getHostedDemoSeedDefinition();
  assert.deepEqual(seed, getHostedDemoSeedDefinition());
  assert.equal(seed.seedVersion, 1);
  assert.match(seed.email, /\.invalid$/);
  assert.equal(new Set(seed.pageIds).size, 4);
  assert.deepEqual(seed.propertyTypes, ["status", "date", "person", "select"]);
  assert.equal(seed.taskDatabaseIds.length, 1);
  assert.equal(new Set(seed.taskPageIds).size, 4);
  assert.equal(new Set(seed.viewIds).size, 3);
  assert.equal(seed.citationUrls.length, 2);
});
