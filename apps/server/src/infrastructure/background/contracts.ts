import { AsyncLocalStorage } from "node:async_hooks";

import type { RuntimeEnv } from "../../shared/config/config";

import {
  createBackgroundTaskV2,
  decodeBackgroundTaskV2,
  getBackgroundCellId,
  type BackgroundTaskV2,
} from "./task-v2";
export { BACKGROUND_TASK_KINDS, getBackgroundCellId, type BackgroundTaskV2 } from "./task-v2";
export type BackgroundTaskKind = BackgroundTaskV2["kind"];

export type BackgroundLane = "fast" | "automation" | "ai" | "calendar";

export type BackgroundTaskResult =
  | { outcome: "completed" | "noop" | "terminal"; errorCode?: string }
  | { outcome: "retry"; availableAt: string; errorCode?: string };

const TRACEPARENT_V00 = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const traceContextStore = new AsyncLocalStorage<{
  traceparent?: string;
  tracestate?: string;
}>();

export function backgroundTaskLane(kind: BackgroundTaskKind): BackgroundLane {
  if (kind === "automation.run" || kind === "agent.run") return "automation";
  if (kind === "ai.job") return "ai";
  if (kind === "calendar.sync") return "calendar";
  return "fast";
}

export function createBackgroundTask(
  input: Parameters<typeof createBackgroundTaskV2>[0],
): BackgroundTaskV2 {
  return createBackgroundTaskV2({ ...traceContextStore.getStore(), ...input });
}

export function parseBackgroundTask(
  value: unknown,
  expectedCellId: string,
): { ok: true; task: BackgroundTaskV2 } | { ok: false; errorCode: string } {
  try {
    return { ok: true, task: decodeBackgroundTaskV2(value, expectedCellId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "BACKGROUND_TASK_INVALID";
    return {
      ok: false,
      errorCode: message.startsWith("BACKGROUND_") ? message : "BACKGROUND_TASK_INVALID",
    };
  }
}

export function runWithBackgroundTraceContext<T>(
  trace: { traceparent?: string; tracestate?: string },
  callback: () => T,
) {
  const traceparent = trace.traceparent?.toLowerCase();
  const context = {
    ...(traceparent && TRACEPARENT_V00.test(traceparent) ? { traceparent } : {}),
    ...(trace.tracestate && trace.tracestate.length <= 512 && !/[^\x20-\x7e]/.test(trace.tracestate)
      ? { tracestate: trace.tracestate }
      : {}),
  };
  return traceContextStore.run(context, callback);
}
