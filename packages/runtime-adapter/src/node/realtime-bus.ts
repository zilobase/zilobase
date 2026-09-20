import { randomUUID } from "node:crypto";
import Redis from "ioredis";

import { getStringEnv, type RuntimeEnv } from "@zilobase/server/node-adapter-api";

const RATE_LIMIT_SCRIPT = `
  local count = redis.call("INCR", KEYS[1])
  if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
  return count
`;

type RealtimeEnvelope = {
  payload: unknown;
  source: string;
};

export type RealtimeSubscription = () => Promise<void>;

export interface NodeRealtimeBus {
  close(): Promise<void>;
  connect(): Promise<void>;
  consumeLimit(key: string, limit: number, windowMs: number): Promise<boolean>;
  isReady(): boolean;
  publish(channel: string, payload: unknown): Promise<void>;
  subscribe(
    channel: string,
    handler: (payload: unknown) => void,
  ): Promise<RealtimeSubscription>;
}

class RedisNodeRealtimeBus implements NodeRealtimeBus {
  private readonly command: Redis;
  private readonly handlers = new Map<string, Set<(payload: unknown) => void>>();
  private readonly instanceId = randomUUID();
  private readonly subscriber: Redis;

  constructor(url: string) {
    const options = {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: realtimeRedisRetryDelay,
    };
    this.command = new Redis(url, options);
    this.subscriber = new Redis(url, options);
    this.command.on("error", logRedisError);
    this.subscriber.on("error", logRedisError);
    this.subscriber.on("message", (channel, raw) => {
      const envelope = parseEnvelope(raw);
      if (!envelope || envelope.source === this.instanceId) return;
      this.handlers.get(channel)?.forEach((handler) => handler(envelope.payload));
    });
  }

  async connect() {
    await Promise.all([this.command.connect(), this.subscriber.connect()]);
  }

  isReady() {
    return this.command.status === "ready" && this.subscriber.status === "ready";
  }

  async publish(channel: string, payload: unknown) {
    await this.command.publish(channel, JSON.stringify({
      payload,
      source: this.instanceId,
    } satisfies RealtimeEnvelope));
  }

  async subscribe(channel: string, handler: (payload: unknown) => void) {
    let handlers = this.handlers.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(channel, handlers);
      await this.subscriber.subscribe(channel);
    }
    handlers.add(handler);

    return async () => {
      const current = this.handlers.get(channel);
      current?.delete(handler);
      if (current?.size) return;
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
    };
  }

  async consumeLimit(key: string, limit: number, windowMs: number) {
    const window = Math.floor(Date.now() / windowMs);
    const count = await this.command.eval(
      RATE_LIMIT_SCRIPT,
      1,
      `zilobase:limit:${key}:${window}`,
      windowMs * 2,
    );
    return Number(count) <= limit;
  }

  async close() {
    this.handlers.clear();
    await Promise.allSettled([
      closeRedisClient(this.command),
      closeRedisClient(this.subscriber),
    ]);
  }
}

export function createNodeRealtimeBus(env: RuntimeEnv): NodeRealtimeBus {
  const url = getRealtimeRedisUrl(env);
  return new RedisNodeRealtimeBus(url);
}

export function getRealtimeRedisUrl(env: RuntimeEnv): string {
  const value = getStringEnv(env, "REALTIME_REDIS_URL")?.trim();
  if (!value) {
    throw new Error(
      "REALTIME_REDIS_URL is required for every Node runtime and must use redis:// or rediss://",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("REALTIME_REDIS_URL must be a valid redis:// or rediss:// URL");
  }
  if (
    (url.protocol !== "redis:" && url.protocol !== "rediss:") ||
    !url.hostname
  ) {
    throw new Error("REALTIME_REDIS_URL must be a valid redis:// or rediss:// URL");
  }

  return url.toString();
}

function realtimeRedisRetryDelay(attempt: number) {
  const exponential = Math.min(100 * 2 ** Math.min(attempt - 1, 5), 3_000);
  return exponential + Math.floor(Math.random() * 250);
}

async function closeRedisClient(client: Redis) {
  if (client.status === "end") return;
  if (client.status !== "ready") {
    client.disconnect(false);
    return;
  }

  try {
    await client.quit();
  } finally {
    client.disconnect(false);
  }
}

export function databaseRealtimeChannel(databaseId: string) {
  return `zilobase:realtime:database:${databaseId}`;
}

export function mailRealtimeChannel(bindingId: string) {
  return `zilobase:realtime:mail:${bindingId}`;
}

export function navigationRealtimeChannel(workspaceId: string) {
  return `zilobase:realtime:navigation:${workspaceId}`;
}

function parseEnvelope(raw: string): RealtimeEnvelope | null {
  try {
    const value = JSON.parse(raw) as Partial<RealtimeEnvelope>;
    return typeof value.source === "string" && "payload" in value
      ? value as RealtimeEnvelope
      : null;
  } catch {
    return null;
  }
}

function logRedisError(error: Error) {
  console.error(JSON.stringify({
    error: error.message,
    event: "realtime_redis_error",
  }));
}

export function calendarRealtimeChannel(bindingId: string) { return `calendar:${bindingId}` }
