import type { FanoutBus, Unsubscribe } from "@zilobase/runtime-ports";
import type { NodeRealtimeBus } from "./realtime-bus";

export function createNodeFanout(
  realtimeBus: NodeRealtimeBus,
  publishLocal: (channel: string, payload: unknown) => void | Promise<void>,
): FanoutBus {
  return {
    async publish(channel, payload) {
      await publishLocal(channel, payload);
    },
    async subscribe(channel, handler): Promise<Unsubscribe> {
      return realtimeBus.subscribe(channel, handler);
    },
  };
}
