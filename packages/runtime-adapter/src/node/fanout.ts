import type { FanoutBus, Unsubscribe } from "@zilobase/runtime-ports";
import type { NodeRealtimeBus } from "./realtime-bus";

export function createNodeFanout(
  realtimeBus: NodeRealtimeBus | null,
  publishLocal: (channel: string, payload: unknown) => void | Promise<void>,
): FanoutBus {
  return {
    async publish(channel, payload) {
      await publishLocal(channel, payload);
    },
    async subscribe(channel, handler): Promise<Unsubscribe> {
      if (!realtimeBus) return () => {};
      return realtimeBus.subscribe(channel, handler);
    },
  };
}
