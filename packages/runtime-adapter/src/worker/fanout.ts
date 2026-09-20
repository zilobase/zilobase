import type { FanoutBus } from "@zilobase/runtime-ports";
import type { WorkerEnvBindings } from "./adapter";

export function createWorkerFanout(env: WorkerEnvBindings): FanoutBus {
  return {
    async publish(channel, payload) {
      const separator = channel.indexOf(":");
      const kind = separator < 0 ? channel : channel.slice(0, separator);
      const id = separator < 0 ? "" : channel.slice(separator + 1);
      if (!id) throw new Error(`Invalid fanout channel: ${channel}`);
      if (kind === "db") {
        const namespace = env.DATABASE_COLLABORATION;
        if (!namespace) throw new Error("DATABASE_COLLABORATION binding is required");
        await namespace.getByName(id).publishMutation(payload as never);
        return;
      }
      if (kind === "calendar") {
        const namespace = env.CALENDAR_NOTIFICATION_ROOM;
        if (!namespace) throw new Error("CALENDAR_NOTIFICATION_ROOM binding is required");
        await namespace.getByName(id).publishNotification(payload as never);
        return;
      }
      if (kind === "mail") {
        const namespace = env.MAIL_NOTIFICATION_ROOM;
        if (!namespace) throw new Error("MAIL_NOTIFICATION_ROOM binding is required");
        await namespace.getByName(id).publishNotification(payload as never);
        return;
      }
      if (kind === "navigation") {
        const namespace = env.NAVIGATION_NOTIFICATION_ROOM;
        if (!namespace) throw new Error("NAVIGATION_NOTIFICATION_ROOM binding is required");
        await namespace.getByName(id).publishInvalidation(payload as never);
        return;
      }
      throw new Error(`Unsupported fanout channel: ${channel}`);
    },
    async subscribe() {
      return () => {};
    },
  };
}
