import {
  backgroundTaskLane,
  type BackgroundLane,
  type BackgroundTaskResult,
} from "../../infrastructure/background/contracts";
import {
  decodeBackgroundTaskV2,
  type BackgroundTaskV2,
} from "../../infrastructure/background/task-v2";

export interface BackgroundDeliveryStore {
  load(task: BackgroundTaskV2): Promise<"ready" | "done">;
  complete(task: BackgroundTaskV2, result: BackgroundTaskResult): Promise<void>;
  reschedule(task: BackgroundTaskV2, availableAt: string): Promise<void>;
}

export async function runBackgroundDelivery(input: {
  body: unknown;
  cellId: string;
  lane: BackgroundLane;
  now?: number;
  store: BackgroundDeliveryStore;
  execute(task: BackgroundTaskV2): Promise<BackgroundTaskResult>;
}): Promise<{ outcome: "ack" } | { outcome: "defer"; availableAt: string }> {
  const task = decodeBackgroundTaskV2(input.body, input.cellId);
  if (backgroundTaskLane(task.kind) !== input.lane)
    throw new Error("BACKGROUND_TASK_LANE_MISMATCH");
  if ((await input.store.load(task)) === "done") return { outcome: "ack" };
  if (Date.parse(task.availableAt) > (input.now ?? Date.now()))
    return { outcome: "defer", availableAt: task.availableAt };
  const result = await input.execute(task);
  if (result.outcome === "retry") {
    if (!Number.isFinite(Date.parse(result.availableAt)))
      throw new Error("BACKGROUND_RETRY_DATE_INVALID");
    await input.store.reschedule(task, result.availableAt);
  } else {
    await input.store.complete(task, result);
  }
  return { outcome: "ack" };
}
