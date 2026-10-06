import { Queue, createIORedisClient } from "bullmq";
import Redis from "ioredis";
import { getQueueRedisUrl, NODE_BACKGROUND_QUEUE_NAMES } from "./queue-runtime";

/** Purges exactly one cell's four queues, including retained failed jobs. */
export async function purgeNodeCellQueues(env: Record<string, unknown>, cellId: string) {
  const expected =
    typeof env.ZILOBASE_CELL_ID === "string" && env.ZILOBASE_CELL_ID.trim()
      ? env.ZILOBASE_CELL_ID.trim()
      : "default";
  if (!cellId || cellId !== expected) throw new Error("QUEUE_PURGE_CELL_MISMATCH");
  const redis = new Redis(getQueueRedisUrl(env), {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 5000,
  });
  redis.on("error", () => {});
  const queues = Object.values(NODE_BACKGROUND_QUEUE_NAMES).map(
    (name) =>
      new Queue(name, {
        connection: createIORedisClient(redis),
        prefix: `zilobase:${encodeURIComponent(cellId)}`,
      }),
  );
  for (const queue of queues) queue.on("error", () => {});
  try {
    await Promise.race([
      Promise.all(queues.map((queue) => queue.waitUntilReady())),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("QUEUE_PURGE_BROKER_UNAVAILABLE")), 2500),
      ),
    ]);
    for (const queue of queues) await queue.obliterate({ force: true });
    return { cellId, purged: queues.map((queue) => queue.name) };
  } finally {
    redis.disconnect();
    await Promise.allSettled(queues.map((queue) => queue.close()));
  }
}
