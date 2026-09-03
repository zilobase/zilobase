import type { RuntimeEnv } from "../../shared/config/config";
import { getRuntimeAdapter } from "../runtime/runtime-adapter";
import type { BackgroundTaskV1 } from "./contracts";
import { backgroundTaskLane, getBackgroundCellId } from "./contracts";
import { recordBackgroundCounter } from "./telemetry";

export async function dispatchBackgroundTasks(
  env: RuntimeEnv,
  tasks: readonly BackgroundTaskV1[],
) {
  if (tasks.length === 0) return true;
  const dispatch = getRuntimeAdapter().dispatchBackgroundTasks;
  if (!dispatch) return false;
  try {
    await dispatch({ env, tasks: [...tasks] });
    for (const task of tasks) recordBackgroundCounter("enqueue", {
      cell: getBackgroundCellId(env),
      kind: task.kind,
      lane: backgroundTaskLane(task.kind),
      outcome: "completed",
      runtime: env.HYPERDRIVE ? "cloudflare" : "node",
    });
    console.info(JSON.stringify({
      count: tasks.length,
      event: "background.dispatch",
      outcome: "completed",
    }));
    return true;
  } catch (error) {
    for (const task of tasks) recordBackgroundCounter("dispatch_failure", {
      cell: getBackgroundCellId(env),
      error_code: boundedErrorCode(error),
      kind: task.kind,
      lane: backgroundTaskLane(task.kind),
      outcome: "failed",
      runtime: env.HYPERDRIVE ? "cloudflare" : "node",
    });
    console.warn(JSON.stringify({
      code: boundedErrorCode(error),
      count: tasks.length,
      event: "background.dispatch",
      outcome: "failed",
    }));
    return false;
  }
}

export function boundedErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code).replace(/[^A-Z0-9_.-]/gi, "_").slice(0, 80);
  }
  return error instanceof Error
    ? error.name.replace(/[^A-Z0-9_.-]/gi, "_").slice(0, 80)
    : "UNKNOWN";
}
