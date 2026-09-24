import assert from "node:assert/strict";
import { test } from "vitest";
import { Hono } from "hono";
import { requestId } from "hono/request-id";

import { REQUEST_ID_HEADER, serverTimingMiddleware } from "./timing";
import type { AppBindings } from "../shared/types";

function timedApp() {
  const app = new Hono<AppBindings>();
  app.use("*", requestId({ headerName: REQUEST_ID_HEADER }));
  app.use("*", serverTimingMiddleware);
  return app;
}

test("server timing preserves request IDs and emits collected timings", async () => {
  const app = timedApp();
  app.get("/timed", (c) => {
    c.get("serverTimings").push("database;dur=12");
    return c.text("ok");
  });

  const response = await app.request("/timed", {
    headers: { "x-zilobase-request-id": "request-1" },
  });

  assert.equal(response.headers.get("x-zilobase-request-id"), "request-1");
  assert.equal(response.headers.get("x-zilobase-app-path"), "/timed");
  assert.equal(response.headers.get("server-timing"), "database;dur=12");
});

test("server timing omits empty metrics", async () => {
  const app = timedApp();
  app.get("/plain", (c) => c.text("ok"));

  const response = await app.request("/plain");

  assert.match(response.headers.get("x-zilobase-request-id") ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.has("server-timing"), false);
});

test("server timing generates an ID when upstream provides none", async () => {
  const app = timedApp();
  app.get("/generated", (c) => c.text("ok"));

  const response = await app.request("/generated");

  assert.match(response.headers.get("x-zilobase-request-id") ?? "", /^[0-9a-f-]{36}$/);
});
