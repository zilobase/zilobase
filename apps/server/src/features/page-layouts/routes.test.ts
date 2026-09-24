import assert from "node:assert/strict";
import { Hono } from "hono";
import { test } from "vitest";

import { pageLayoutRoutes } from "./routes";
import type { AppBindings } from "../../shared/types";
import { jsonContentTypeHeaders } from "../../shared/http/json";

function app(authenticated = true) {
  return new Hono<AppBindings>()
    .use("*", async (c, next) => {
      if (authenticated) {
        c.set("user", {
          id: "user",
          name: "User",
          email: "user@example.test",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
        });
      }
      await next();
    })
    .route("/", pageLayoutRoutes);
}

test("layout writes require a session and reject invalid scope or body", async () => {
  assert.equal((await app(false).request("/page/page-1", { method: "PUT" })).status, 401);

  const invalidScope = await app().request("/folder/page-1", {
    body: JSON.stringify({ config: {} }),
    headers: jsonContentTypeHeaders(),
    method: "PUT",
  });
  assert.equal(invalidScope.status, 400);
  assert.deepEqual(await invalidScope.json(), { error: "Invalid layout." });

  const invalidBody = await app().request("/page/page-1", {
    body: "{",
    headers: jsonContentTypeHeaders(),
    method: "PUT",
  });
  assert.equal(invalidBody.status, 400);
  assert.deepEqual(await invalidBody.json(), { error: "Invalid layout." });
});

test("layout deletes reject an invalid scope before persistence", async () => {
  const response = await app().request("/folder/page-1", { method: "DELETE" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid scope." });
});
