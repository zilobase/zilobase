import assert from "node:assert/strict";
import { test } from "vitest";
import { Hono } from "hono";

import { serverTimingMiddleware } from "./timing";
import type { AppBindings } from "../types";

test("server timing preserves request IDs and emits collected timings", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", serverTimingMiddleware);
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

test("server timing falls back to Cloudflare ray IDs and omits empty metrics", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", serverTimingMiddleware);
  app.get("/plain", (c) => c.text("ok"));

  const response = await app.request("/plain", {
    headers: { "cf-ray": "ray-1" },
  });

  assert.equal(response.headers.get("x-zilobase-request-id"), "ray-1");
  assert.equal(response.headers.has("server-timing"), false);
});

test("server timing generates an ID when upstream provides none", async () => {
  const app = new Hono<AppBindings>();
  app.use("*", serverTimingMiddleware);
  app.get("/generated", (c) => c.text("ok"));

  const response = await app.request("/generated");

  assert.match(
    response.headers.get("x-zilobase-request-id") ?? "",
    /^[0-9a-f-]{36}$/,
  );
});
