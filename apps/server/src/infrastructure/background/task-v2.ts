import { z } from "zod";
import type { BackgroundLane } from "./contracts";
export const BACKGROUND_TASK_KINDS = [
  "ai.generate",
  "search.page_index",
  "search.workspace_scan",
  "search.invalidate",
  "automation.event_window",
  "automation.run",
  "calendar.sync",
  "realtime.database",
  "notification.publish",
] as const;
export function getBackgroundCellId(env: Record<string, unknown>): string {
  return typeof env.ZILOBASE_CELL_ID === "string" && env.ZILOBASE_CELL_ID.trim()
    ? env.ZILOBASE_CELL_ID.trim()
    : "default";
}

const Task = z.object({
  version: z.literal(2),
  taskId: z.string(),
  cellId: z.string(),
  kind: z.enum(BACKGROUND_TASK_KINDS),
  resourceId: z.string(),
  availableAt: z.string(),
  traceparent: z.string().optional(),
  tracestate: z.string().optional(),
});

export type BackgroundTaskV2 = z.infer<typeof Task>;
export const BACKGROUND_PUBLICATION_HORIZON_MS = 12 * 60 * 60 * 1000;
export const BACKGROUND_LANE_POLICY: Record<
  BackgroundLane,
  { concurrency: number; redeliveries: number }
> = {
  ai: { concurrency: 4, redeliveries: 5 },
  search: { concurrency: 4, redeliveries: 5 },
  fast: { concurrency: 8, redeliveries: 5 },
  automation: { concurrency: 4, redeliveries: 8 },
  calendar: { concurrency: 2, redeliveries: 8 },
};

export function createBackgroundTaskV2(input: {
  env: Record<string, unknown>;
  kind: BackgroundTaskV2["kind"];
  resourceId: string;
  availableAt?: Date;
  taskId?: string;
  traceparent?: string;
  tracestate?: string;
}): BackgroundTaskV2 {
  const task = {
    version: 2 as const,
    taskId: input.taskId ?? crypto.randomUUID(),
    cellId: getBackgroundCellId(input.env),
    kind: input.kind,
    resourceId: input.resourceId,
    availableAt: (input.availableAt ?? new Date()).toISOString(),
    ...(input.traceparent ? { traceparent: input.traceparent } : {}),
    ...(input.tracestate ? { tracestate: input.tracestate } : {}),
  };
  return decodeBackgroundTaskV2(task, task.cellId);
}

export function decodeBackgroundTaskV2(value: unknown, cellId: string): BackgroundTaskV2 {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 16_384)
    throw new Error("BACKGROUND_TASK_TOO_LARGE");
  const task = Task.parse(value);
  if (task.cellId !== cellId) throw new Error("BACKGROUND_TASK_CELL_MISMATCH");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.taskId))
    throw new Error("BACKGROUND_TASK_ID_INVALID");
  if (!task.resourceId || task.resourceId.length > 256)
    throw new Error("BACKGROUND_TASK_RESOURCE_INVALID");
  if (
    !Number.isFinite(Date.parse(task.availableAt)) ||
    new Date(task.availableAt).toISOString() !== task.availableAt
  )
    throw new Error("BACKGROUND_TASK_AVAILABLE_AT_INVALID");
  if (task.traceparent && !/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(task.traceparent))
    throw new Error("BACKGROUND_TASK_TRACE_INVALID");
  if (task.tracestate && (task.tracestate.length > 512 || /[^\x20-\x7e]/.test(task.tracestate)))
    throw new Error("BACKGROUND_TASK_TRACE_INVALID");
  return task;
}
