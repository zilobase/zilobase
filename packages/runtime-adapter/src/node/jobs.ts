import type { Jobs } from "@zilobase/runtime-ports";
import type { NodeQueueRuntime } from "./queue-runtime";

export function createNodeJobs(getQueue: () => NodeQueueRuntime | null): Jobs {
  return {
    async dispatch(tasks) {
      const queue = getQueue();
      if (!queue) throw new Error("BACKGROUND_QUEUE_NOT_STARTED");
      await queue.dispatch(tasks);
    },
  };
}
export type { BackgroundTask } from "@zilobase/runtime-ports";
