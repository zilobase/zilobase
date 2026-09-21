import type { Limits } from "@zilobase/runtime-ports";
import type { NodeRealtimeBus } from "./realtime-bus";

export function createNodeLimits(realtimeBus: NodeRealtimeBus): Limits {
  return {
    consume: (key, limit, windowMs) =>
      realtimeBus.consumeLimit(key, limit, windowMs),
  };
}
