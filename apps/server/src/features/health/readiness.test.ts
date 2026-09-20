import assert from "node:assert/strict";
import { test } from "vitest";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";

import { checkReadiness } from "./readiness";

const withReadiness = <T>(
  realtime: boolean,
  operation: () => T,
) => runWithRuntimePorts({
  readiness: {
    background: () => ({ coordinatorReady: null, listenerReady: null }),
    realtime: () => realtime,
  },
}, operation);

test("readiness requires both Postgres and object storage", async () => {
  const ready = await withReadiness(true, () => checkReadiness({}, {
    async checkDatabase() {},
    async checkObjectStorage() {},
  }));

  assert.deepEqual(ready, {
    checks: { database: "ok", objectStorage: "ok", realtime: "ok" },
    ok: true,
    service: "zilobase-server",
  });

  const unavailable = await withReadiness(true, () => checkReadiness({}, {
    async checkDatabase() {
      throw new Error("private database details");
    },
    async checkObjectStorage() {
      throw new Error("private storage details");
    },
  }));

  assert.deepEqual(unavailable, {
    checks: { database: "unavailable", objectStorage: "unavailable", realtime: "ok" },
    ok: false,
    service: "zilobase-server",
  });
  assert.equal(JSON.stringify(unavailable).includes("private"), false);
});

test("readiness executes independent checks even when one dependency fails", async () => {
  let storageChecked = false;
  const result = await withReadiness(true, () => checkReadiness({}, {
    async checkDatabase() {
      throw new Error("database down");
    },
    async checkObjectStorage() {
      storageChecked = true;
    },
  }));

  assert.equal(storageChecked, true);
  assert.deepEqual(result.checks, {
    database: "unavailable",
    objectStorage: "ok",
    realtime: "ok",
  });
});

test("readiness requires the configured realtime broker", async () => {
  const result = await withReadiness(false, () => checkReadiness({}, {
    async checkDatabase() {},
    async checkObjectStorage() {},
  }));

  assert.equal(result.ok, false);
  assert.equal(result.checks.realtime, "unavailable");
});
