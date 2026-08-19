import { Redis as RedisExtension } from "@hocuspocus/extension-redis";
import type { Extension } from "@hocuspocus/server";

import { getStringEnv, type RuntimeEnv } from "../../config";

export function createNodeCollaborationExtensions(env: RuntimeEnv): Extension[] {
  const value = getStringEnv(env, "REALTIME_REDIS_URL");
  if (!value) return [];
  const url = new URL(value);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REALTIME_REDIS_URL must use redis:// or rediss://");
  }
  const database = url.pathname.slice(1);
  return [new RedisExtension({
    host: url.hostname,
    options: {
      ...(database ? { db: Number(database) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.protocol === "rediss:" ? { tls: { servername: url.hostname } } : {}),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    },
    port: Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379)),
    prefix: "zilobase:hocuspocus",
  })];
}
