import assert from "node:assert/strict";
import { test } from "vitest";

import {
  getCollaborationWebSocketUrl,
  getConfiguredImageStorageMode,
  getDatabaseRealtimeWebSocketUrl,
  getDatabaseUrl,
  getRuntimeAdapter,
  isSelfHostedRuntime,
  runWithRuntimeAdapter,
  setRuntimeAdapter,
} from "./runtime-adapter";

test("runtime URLs honor explicit, adapter, and request-derived values", () => {
  const request = new Request("https://api.example.com/path?secret=value#fragment");

  assert.equal(
    getCollaborationWebSocketUrl(request, {
      COLLABORATION_WEBSOCKET_URL: "wss://configured.example/collaboration",
    }),
    "wss://configured.example/collaboration",
  );
  assert.equal(
    getDatabaseRealtimeWebSocketUrl(request, {
      DATABASE_REALTIME_WEBSOCKET_URL: "wss://configured.example/database",
    }),
    "wss://configured.example/database",
  );

  runWithRuntimeAdapter(
    {
      getCollaborationWebSocketUrl: () => "wss://adapter.example/pages",
      getDatabaseRealtimeWebSocketUrl: () => "wss://adapter.example/databases",
    },
    () => {
      assert.equal(
        getCollaborationWebSocketUrl(request, {}),
        "wss://adapter.example/pages",
      );
      assert.equal(
        getDatabaseRealtimeWebSocketUrl(request, {}),
        "wss://adapter.example/databases",
      );
    },
  );

  assert.equal(
    getCollaborationWebSocketUrl(request, {}),
    "wss://api.example.com/collaboration",
  );
  assert.equal(
    getDatabaseRealtimeWebSocketUrl(
      new Request("http://localhost:8787/original?ignored=true"),
      {},
    ),
    "ws://localhost:8787/database-collaboration",
  );
});

test("runtime database and image configuration validates fallbacks", () => {
  assert.equal(getDatabaseUrl({ DATABASE_URL: "postgres://direct" }), "postgres://direct");
  assert.throws(() => getDatabaseUrl({}), /DATABASE_URL is required/);
  assert.equal(getConfiguredImageStorageMode({}), null);
  assert.equal(getConfiguredImageStorageMode({ IMAGE_STORAGE_MODE: "s3" }), "s3");
  assert.equal(
    getConfiguredImageStorageMode({ IMAGE_STORAGE_MODE: "binding" }),
    "binding",
  );
  assert.throws(
    () => getConfiguredImageStorageMode({ IMAGE_STORAGE_MODE: "filesystem" }),
    /must be either 's3' or 'binding'/,
  );
});

test("request-scoped runtime adapters override and restore the default", async () => {
  const defaultAdapter = { selfHosted: false as const };
  const requestAdapter = {
    getDatabaseUrl: () => "postgres://request",
    selfHosted: false as const,
  };
  setRuntimeAdapter(defaultAdapter);

  try {
    assert.equal(getRuntimeAdapter(), defaultAdapter);
    assert.equal(await runWithRuntimeAdapter(requestAdapter, async () => {
      await Promise.resolve();
      assert.equal(getRuntimeAdapter(), requestAdapter);
      assert.equal(getDatabaseUrl({}), "postgres://request");
      return "scoped";
    }), "scoped");
    assert.equal(getRuntimeAdapter(), defaultAdapter);
  } finally {
    setRuntimeAdapter({});
  }
});

test("parallel runtime contexts remain isolated", async () => {
  const results = await Promise.all([
    runWithRuntimeAdapter(
      { getDatabaseUrl: () => "postgres://one", selfHosted: false },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getDatabaseUrl({});
      },
    ),
    runWithRuntimeAdapter(
      { getDatabaseUrl: () => "postgres://two", selfHosted: false },
      async () => getDatabaseUrl({}),
    ),
  ]);

  assert.deepEqual(results, ["postgres://one", "postgres://two"]);
  assert.equal(isSelfHostedRuntime(), true);
});
