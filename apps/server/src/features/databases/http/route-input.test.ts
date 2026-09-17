import assert from "node:assert/strict";
import { Hono } from "hono";
import { test } from "vitest";
import type { AppBindings } from   "../../../shared/types";
import { databaseCreateRoutes } from    "./core-routes";
import { databaseAutomationRoutes } from  "../../automations/http/routes";

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
    .route("/create", databaseCreateRoutes)
    .route("/automation", databaseAutomationRoutes);
}
test("database transport authenticates before JSON validation", async () => {
  for (const [path, method] of [["/create", "POST"]]) {
    const request = (authenticated: boolean, body: string) =>
      app(authenticated).request(path, {
        method,
        body,
        headers: { "content-type": "application/json" },
      });
    for (const body of ["{", "null", "42", '"text"']) {
      assert.equal((await request(false, body)).status, 401);
      const response = await request(true, body);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "A JSON body is required",
      });
    }
  }
});
test("automation source queries authenticate before requiring a trimmed source", async () => {
  for (const path of [
    "/automation/db/automations",
    "/automation/db/automations/audit",
    "/automation/db/automation-catalog",
  ]) {
    assert.equal((await app(false).request(path)).status, 401);
    for (const query of ["", "?dataSourceId=%20%20"]) {
      const response = await app(true).request(path + query);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        code: "AUTOMATION_SOURCE_REQUIRED",
        error: "dataSourceId is required",
      });
    }
  }
});
