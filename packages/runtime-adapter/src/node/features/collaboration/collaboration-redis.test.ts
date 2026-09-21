import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { createNodeCollaborationExtensions } from "./collaboration-redis";

type RedisLike = {
  disconnect(reconnect?: boolean): void;
  emit(event: "error", error: Error): boolean;
  listenerCount(event: "error"): number;
  options: {
    db: number;
    maxRetriesPerRequest: number | null;
    retryStrategy?: unknown;
  };
};

const clients: RedisLike[] = [];

afterEach(() => {
  clients.splice(0).forEach((client) => client.disconnect(false));
  vi.restoreAllMocks();
});

test("collaboration Redis clients share the realtime reconnect and structured error policy", () => {
  const [extension] = createNodeCollaborationExtensions({
    REALTIME_REDIS_URL: "rediss://user:password@cache.example.test:6380/4",
  });
  const redisExtension = extension as unknown as {
    pub: RedisLike;
    sub: RedisLike;
  };
  clients.push(redisExtension.pub, redisExtension.sub);

  for (const client of clients) {
    assert.equal(client.options.db, 4);
    assert.equal(client.options.maxRetriesPerRequest, 3);
    assert.equal(typeof client.options.retryStrategy, "function");
    assert.ok(client.listenerCount("error") > 0);
  }

  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  redisExtension.pub.emit("error", new Error("connection lost"));
  assert.deepEqual(error.mock.calls, [[JSON.stringify({
    error: "connection lost",
    event: "realtime_redis_error",
  })]]);
});
