import { randomUUID } from "node:crypto";
import Redis from "ioredis";

import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";

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
    const options = { enableReadyCheck: true, lazyConnect: true, maxRetriesPerRequest: 3 };
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
    await Promise.allSettled([this.command.quit(), this.subscriber.quit()]);
  }
}

export function createNodeRealtimeBus(env: RuntimeEnv) {
  const url = getRealtimeRedisUrl(env);
  return url ? new RedisNodeRealtimeBus(url) : null;
}

export function getRealtimeRedisUrl(env: RuntimeEnv) {
  const value = getStringEnv(env, "REALTIME_REDIS_URL");
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REALTIME_REDIS_URL must use redis:// or rediss://");
  }
  return url.toString();
}

export function databaseRealtimeChannel(databaseId: string) {
  return `zilobase:realtime:database:${databaseId}`;
}

export function mailRealtimeChannel(connectionId: string) {
  return `zilobase:realtime:mail:${connectionId}`;
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
