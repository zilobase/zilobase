import type { BackgroundLane, BackgroundTask, Jobs } from "@zilobase/runtime-ports";
import { backgroundTaskLane } from "@zilobase/server/adapter-api";
import type { WorkerEnvBindings } from "./bindings";

type BackgroundQueue = {
  send(message: BackgroundTask, options?: { delaySeconds?: number }): Promise<void>;
};

export type WorkerJobsEnv = WorkerEnvBindings & {
  BACKGROUND_FAST?: BackgroundQueue;
  AI_JOBS?: BackgroundQueue;
  AUTOMATION_RUNS?: BackgroundQueue;
  MAIL_JOBS?: BackgroundQueue;
};

export function createWorkerJobs(
  env: WorkerJobsEnv,
  drainLane?: (lane: BackgroundLane) => void | Promise<void>,
): Jobs {
  return {
    async dispatch(tasks) {
      await Promise.all(tasks.map(async (task) => {
        const lane = backgroundTaskLane(task.kind as never);
        const queue = queueForLane(env, lane);
        if (!queue) throw new Error(`BACKGROUND_${lane.toUpperCase()}_QUEUE_REQUIRED`);
        const delaySeconds = Math.max(
          0,
          Math.min(43_200, Math.ceil((Date.parse(task.availableAt) - Date.now()) / 1_000)),
        );
        if (delaySeconds > 0) await queue.send(task, { delaySeconds });
        else await queue.send(task);
      }));
    },
    async drain(lane) {
      await drainLane?.(lane);
    },
  };
}

function queueForLane(env: WorkerJobsEnv, lane: BackgroundLane) {
  if (lane === "fast") return env.BACKGROUND_FAST;
  if (lane === "automation") return env.AUTOMATION_RUNS;
  if (lane === "ai") return env.AI_JOBS;
  return env.MAIL_JOBS;
}
