import { AsyncLocalStorage } from "node:async_hooks";

import type { RuntimeEnv } from "../../shared/config/config";

export const BACKGROUND_TASK_KINDS = [
  "automation.event_window",
  "automation.run",
  "ai.job",
  "mail.index",
  "mail.database_sync",
  "realtime.database",
  "realtime.navigation",
  "notification.publish",
] as const;

export type BackgroundTaskKind = (typeof BACKGROUND_TASK_KINDS)[number];

export type BackgroundTaskV1 = {
  availableAt: string;
  cellId: string;
  kind: BackgroundTaskKind;
  resourceId: string;
  traceparent?: string;
  tracestate?: string;
  version: 1;
};

export type BackgroundLane = "fast" | "automation" | "ai" | "mail";

export type BackgroundTaskResult =
  | { outcome: "completed" | "noop" | "terminal"; errorCode?: string }
  | { outcome: "retry"; availableAt: string; errorCode?: string };

const TASK_KINDS = new Set<string>(BACKGROUND_TASK_KINDS);
const TRACEPARENT_V00 = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const traceContextStore = new AsyncLocalStorage<{
  traceparent?: string;
  tracestate?: string;
}>();

export function backgroundTaskLane(kind: BackgroundTaskKind): BackgroundLane {
  if (kind === "automation.run") return "automation";
  if (kind === "ai.job") return "ai";
  if (kind === "mail.index" || kind === "mail.database_sync") return "mail";
  return "fast";
}

export function getBackgroundCellId(env: RuntimeEnv): string {
  const value = env.ZILOBASE_CELL_ID;
  return typeof value === "string" && value.trim() ? value.trim() : "default";
}

export function createBackgroundTask(input: {
  availableAt?: Date;
  env: RuntimeEnv;
  kind: BackgroundTaskKind;
  resourceId: string;
  traceparent?: string;
  tracestate?: string;
}): BackgroundTaskV1 {
  const activeTrace = traceContextStore.getStore();
  const traceparent = input.traceparent ?? activeTrace?.traceparent;
  const tracestate = input.tracestate ?? activeTrace?.tracestate;
  return {
    availableAt: (input.availableAt ?? new Date()).toISOString(),
    cellId: getBackgroundCellId(input.env),
    kind: input.kind,
    resourceId: input.resourceId,
    ...(traceparent ? { traceparent } : {}),
    ...(tracestate ? { tracestate } : {}),
    version: 1,
  };
}

export function parseBackgroundTask(
  value: unknown,
  expectedCellId: string,
): { ok: true; task: BackgroundTaskV1 } | { ok: false; errorCode: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errorCode: "BACKGROUND_TASK_INVALID", ok: false };
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) {
    return { errorCode: "BACKGROUND_TASK_VERSION_UNSUPPORTED", ok: false };
  }
  if (typeof candidate.kind !== "string" || !TASK_KINDS.has(candidate.kind)) {
    return { errorCode: "BACKGROUND_TASK_KIND_INVALID", ok: false };
  }
  if (typeof candidate.cellId !== "string" || candidate.cellId !== expectedCellId) {
    return { errorCode: "BACKGROUND_TASK_CELL_MISMATCH", ok: false };
  }
  if (
    typeof candidate.resourceId !== "string" ||
    candidate.resourceId.length === 0 ||
    candidate.resourceId.length > 256
  ) {
    return { errorCode: "BACKGROUND_TASK_RESOURCE_INVALID", ok: false };
  }
  if (
    typeof candidate.availableAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.availableAt))
  ) {
    return { errorCode: "BACKGROUND_TASK_AVAILABLE_AT_INVALID", ok: false };
  }
  if (
    candidate.traceparent !== undefined &&
    (typeof candidate.traceparent !== "string" || !TRACEPARENT_V00.test(candidate.traceparent))
  ) {
    return { errorCode: "BACKGROUND_TASK_TRACE_INVALID", ok: false };
  }
  if (
    candidate.tracestate !== undefined &&
    (typeof candidate.tracestate !== "string" || candidate.tracestate.length > 512 || /[^\x20-\x7e]/.test(candidate.tracestate))
  ) {
    return { errorCode: "BACKGROUND_TASK_TRACE_INVALID", ok: false };
  }
  return { ok: true, task: candidate as BackgroundTaskV1 };
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
