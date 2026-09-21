import type { Limits } from "@zilobase/runtime-ports";
import type { NodeRealtimeBus } from "./realtime-bus";

export function createNodeLimits(realtimeBus: NodeRealtimeBus | null): Limits {
  const entries = new Map<string, { count: number; startedAt: number }>();
  return {
    async consume(key, limit, windowMs) {
      if (realtimeBus) return realtimeBus.consumeLimit(key, limit, windowMs);
      const now = Date.now();
      const current = entries.get(key);
      if (!current || now - current.startedAt >= windowMs) {
        entries.set(key, { count: 1, startedAt: now });
        sweep(entries, now, windowMs);
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
  };
}

function sweep(
  entries: Map<string, { count: number; startedAt: number }>,
  now: number,
  windowMs: number,
) {
  if (entries.size < 1_000) return;
  for (const [key, entry] of entries) {
    if (now - entry.startedAt >= windowMs) entries.delete(key);
  }
}
