import assert from "node:assert/strict";
import { test } from "vitest";

import { createNodeRealtimeBus, getRealtimeRedisUrl } from "./realtime-bus";

test("realtime bus requires Redis in every Node topology", () => {
  assert.throws(
    () => createNodeRealtimeBus({}),
    /REALTIME_REDIS_URL is required for every Node runtime/,
  );
  assert.throws(
    () => getRealtimeRedisUrl({ REALTIME_REDIS_URL: "not a url" }),
    /valid redis:\/\/ or rediss:\/\//,
  );
});

test("realtime bus accepts Redis and Valkey-compatible URLs", () => {
  assert.equal(
    getRealtimeRedisUrl({ REALTIME_REDIS_URL: "redis://valkey:6379/0" }),
    "redis://valkey:6379/0",
  );
  assert.equal(
    getRealtimeRedisUrl({ REALTIME_REDIS_URL: "rediss://cache.example.com" }),
    "rediss://cache.example.com",
  );
  assert.throws(
    () => getRealtimeRedisUrl({ REALTIME_REDIS_URL: "https://cache.example.com" }),
    /valid redis:\/\/ or rediss:\/\//,
  );
});
