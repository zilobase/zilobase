import { Redis as RedisExtension } from "@hocuspocus/extension-redis";
import type { Extension } from "@hocuspocus/server";

import type { RuntimeEnv } from "@zilobase/server/node-adapter-api";
import {
  getRealtimeRedisUrl,
  logRealtimeRedisError,
  realtimeRedisRetryDelay,
} from "../../realtime-bus";

export function createNodeCollaborationExtensions(env: RuntimeEnv): Extension[] {
  const url = new URL(getRealtimeRedisUrl(env));
  const database = url.pathname.slice(1);
  const extension = new RedisExtension({
    host: url.hostname,
    options: {
      ...(database ? { db: Number(database) } : {}),
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      retryStrategy: realtimeRedisRetryDelay,
      ...(url.protocol === "rediss:" ? { tls: { servername: url.hostname } } : {}),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    },
    port: Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379)),
    prefix: "zilobase:hocuspocus",
  });
  extension.pub.on("error", logRealtimeRedisError);
  extension.sub.on("error", logRealtimeRedisError);
  return [extension];
}
