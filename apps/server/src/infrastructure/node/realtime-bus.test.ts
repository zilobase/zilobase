import assert from "node:assert/strict";
import { test } from "vitest";

import { getRealtimeRedisUrl } from "./realtime-bus";

test("realtime bus accepts Redis and Valkey-compatible URLs", () => {
  assert.equal(getRealtimeRedisUrl({}), null);
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
    /must use redis/,
  );
});
