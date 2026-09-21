import type { BackgroundTask, Jobs } from "@zilobase/runtime-ports";
import type { BackgroundTaskV1, RuntimeEnv } from "../contracts";
import {
  publishNodeBackgroundNotification,
  type NodeBackgroundCoordinator,
} from "./background-coordinator";

export function createNodeJobs(
  env: RuntimeEnv,
  getCoordinator: () => NodeBackgroundCoordinator | null,
): Jobs {
  return {
    async dispatch(tasks) {
      const compatibleTasks = tasks as readonly BackgroundTaskV1[];
      const coordinator = getCoordinator();
      if (coordinator) {
        await coordinator.dispatch([...compatibleTasks]);
        return;
      }
      await publishNodeBackgroundNotification(env, [...compatibleTasks]);
    },
    async drain(lane) {
      await getCoordinator()?.drain(lane);
    },
  } satisfies Jobs;
}

export type { BackgroundTask };
