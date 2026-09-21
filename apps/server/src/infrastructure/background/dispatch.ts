import type { RuntimeEnv } from "../../shared/config/config";
import { requireRuntimePort } from "@zilobase/runtime-adapter/capabilities";
import type { BackgroundTaskV1 } from "./contracts";
import { backgroundTaskLane, getBackgroundCellId } from "./contracts";
import { recordBackgroundCounter } from "./telemetry";

export async function dispatchBackgroundTasks(
  env: RuntimeEnv,
  tasks: readonly BackgroundTaskV1[],
) {
  if (tasks.length === 0) return true;
  const jobs = requireRuntimePort("jobs");
  const telemetry = requireRuntimePort("telemetry");
  try {
    await jobs.dispatch(tasks);
    for (const task of tasks) recordBackgroundCounter("enqueue", {
      cell: getBackgroundCellId(env),
      kind: task.kind,
      lane: backgroundTaskLane(task.kind),
      outcome: "completed",
      runtime: env.ZILOBASE_RUNTIME_KIND === "worker" ? "edge" : "node",
    });
    await telemetry.event("background.dispatch", {
      count: tasks.length,
      outcome: "completed",
    });
    return true;
  } catch (error) {
    for (const task of tasks) recordBackgroundCounter("dispatch_failure", {
      cell: getBackgroundCellId(env),
      error_code: boundedErrorCode(error),
      kind: task.kind,
      lane: backgroundTaskLane(task.kind),
      outcome: "failed",
      runtime: env.ZILOBASE_RUNTIME_KIND === "worker" ? "edge" : "node",
    });
    await telemetry.error(error, {
      code: boundedErrorCode(error),
      count: tasks.length,
      outcome: "failed",
    });
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
