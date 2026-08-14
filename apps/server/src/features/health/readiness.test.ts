import assert from "node:assert/strict";
import { test } from "vitest";

import { checkReadiness } from "./readiness";

test("readiness requires both Postgres and object storage", async () => {
  const ready = await checkReadiness({}, {
    async checkDatabase() {},
    async checkObjectStorage() {},
  });

  assert.deepEqual(ready, {
    checks: { database: "ok", objectStorage: "ok" },
    ok: true,
    service: "zilobase-server",
  });

  const unavailable = await checkReadiness({}, {
    async checkDatabase() {
      throw new Error("private database details");
    },
    async checkObjectStorage() {
      throw new Error("private storage details");
    },
  });

  assert.deepEqual(unavailable, {
    checks: { database: "unavailable", objectStorage: "unavailable" },
    ok: false,
    service: "zilobase-server",
  });
  assert.equal(JSON.stringify(unavailable).includes("private"), false);
});

test("readiness executes independent checks even when one dependency fails", async () => {
  let storageChecked = false;
  const result = await checkReadiness({}, {
    async checkDatabase() {
      throw new Error("database down");
    },
    async checkObjectStorage() {
      storageChecked = true;
    },
  });

  assert.equal(storageChecked, true);
  assert.deepEqual(result.checks, {
    database: "unavailable",
    objectStorage: "ok",
  });
});
