import assert from "node:assert/strict";
import { test } from "vitest";
import { createRuntimeEnv } from "@zilobase/runtime-adapter/env";
import { createUrlResolver } from "@zilobase/runtime-adapter/url-resolver";
import {
  getCollaborationWebSocketUrl,
  getDatabaseRealtimeWebSocketUrl,
  getDatabaseUrl,
  getRuntimePorts,
  runWithRuntimePorts,
} from "@zilobase/runtime-adapter/capabilities";

test("runtime URLs honor provider configuration and request-derived values", () => {
  const request = new Request("https://api.example.com/path?secret=value#fragment");
  const configuredEnv = createRuntimeEnv({
    COLLABORATION_WEBSOCKET_URL: "wss://configured.example/collaboration",
    DATABASE_REALTIME_WEBSOCKET_URL: "wss://configured.example/database",
  });
  runWithRuntimePorts({ env: configuredEnv, urls: createUrlResolver(configuredEnv) }, () => {
    assert.equal(getCollaborationWebSocketUrl(request), "wss://configured.example/collaboration");
    assert.equal(getDatabaseRealtimeWebSocketUrl(request), "wss://configured.example/database");
  });

  const defaultEnv = createRuntimeEnv({});
  runWithRuntimePorts({ env: defaultEnv, urls: createUrlResolver(defaultEnv) }, () => {
    assert.equal(getCollaborationWebSocketUrl(request), "wss://api.example.com/collaboration");
    assert.equal(
      getDatabaseRealtimeWebSocketUrl(new Request("http://localhost:8787/original?ignored=true")),
      "ws://localhost:8787/database-collaboration",
    );
  });
});

test("runtime database configuration validates its fallback", () => {
  assert.equal(getDatabaseUrl({ DATABASE_URL: "postgres://direct" }), "postgres://direct");
  const emptyEnv = createRuntimeEnv({});
  assert.throws(
    () => runWithRuntimePorts({ env: emptyEnv }, () => getDatabaseUrl({})),
    /DATABASE_URL is required/,
  );
});

test("runtime ports require an explicit scope", async () => {
  const requestEnv = createRuntimeEnv({ DATABASE_URL: "postgres://request", ZILOBASE_EDITION: "hosted" });
  assert.throws(() => getRuntimePorts(), /Runtime ports context is required/);
  assert.equal(
    await runWithRuntimePorts({ env: requestEnv }, async () => {
      await Promise.resolve();
      assert.equal(getRuntimePorts().env, requestEnv);
      assert.equal(getDatabaseUrl({}), "postgres://request");
      return "scoped";
    }),
    "scoped",
  );
  assert.throws(() => getRuntimePorts(), /Runtime ports context is required/);
});

test("parallel runtime port contexts remain isolated", async () => {
  const results = await Promise.all([
    runWithRuntimePorts({ env: createRuntimeEnv({ DATABASE_URL: "postgres://one" }) }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getDatabaseUrl({});
    }),
    runWithRuntimePorts(
      { env: createRuntimeEnv({ DATABASE_URL: "postgres://two" }) },
      async () => getDatabaseUrl({}),
    ),
  ]);
  assert.deepEqual(results, ["postgres://one", "postgres://two"]);
});
