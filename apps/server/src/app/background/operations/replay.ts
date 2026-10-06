import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { backgroundDispatch } from "../../../infrastructure/database/schema";
import {
  backgroundTransaction,
  persistBackgroundTasks,
} from "../../../infrastructure/background/publication";
import { getBackgroundCellId } from "../../../infrastructure/background/contracts";
import { decodeBackgroundTaskV2 } from "../../../infrastructure/background/task-v2";
import { prepareAiJobReplay } from "../../../features/ai/jobs/delivery-failure";
import { prepareAgentReplay } from "../../../features/ai/execution/delivery-failure";
import { prepareAutomationReplay } from "../../../features/automations/execution/delivery-failure";
import { prepareCalendarReplay } from "../../../features/calendar/delivery-failure";
import { prepareDatabaseRealtimeReplay } from "../../../features/databases/realtime/background";
import { prepareNotificationReplay } from "../../../features/notifications/background";
import type { RuntimeEnv } from "../../../shared/config/config";

export async function inspectBackgroundFailures(env: RuntimeEnv, limit = 50) {
  return db
    .select({
      taskId: backgroundDispatch.id,
      kind: backgroundDispatch.kind,
      resourceId: backgroundDispatch.resourceId,
      status: backgroundDispatch.status,
      errorCode: backgroundDispatch.errorCode,
      completedAt: backgroundDispatch.completedAt,
      failureHandledAt: backgroundDispatch.failureHandledAt,
    })
    .from(backgroundDispatch)
    .where(
      and(
        eq(backgroundDispatch.cellId, getBackgroundCellId(env)),
        inArray(backgroundDispatch.status, ["terminal", "exhausted"]),
      ),
    )
    .orderBy(desc(backgroundDispatch.completedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function replayBackgroundFailure(env: RuntimeEnv, taskId: string) {
  return backgroundTransaction(
    env,
    async (tx) => {
      const [record] = await tx
        .select()
        .from(backgroundDispatch)
        .where(
          and(
            eq(backgroundDispatch.id, taskId),
            eq(backgroundDispatch.cellId, getBackgroundCellId(env)),
          ),
        )
        .for("update");
      if (!record || record.status !== "exhausted" || !record.failureHandledAt)
        throw new Error("REPLAY_REQUIRES_FINALIZED_EXHAUSTION");
      const task = decodeBackgroundTaskV2(record.task, getBackgroundCellId(env));
      switch (task.kind) {
        case "ai.job":
          await prepareAiJobReplay(task.resourceId);
          break;
        case "agent.run":
          await prepareAgentReplay(task.resourceId);
          break;
        case "automation.run":
          await prepareAutomationReplay(task.resourceId, false);
          break;
        case "automation.event_window":
          await prepareAutomationReplay(task.resourceId, true);
          break;
        case "calendar.sync":
          await prepareCalendarReplay(task.resourceId);
          break;
        case "realtime.database":
          await prepareDatabaseRealtimeReplay(task.resourceId);
          break;
        case "notification.publish":
          await prepareNotificationReplay(task.resourceId);
          break;
      }
      const next = { ...task, taskId: crypto.randomUUID(), availableAt: new Date().toISOString() };
      await persistBackgroundTasks(
        env,
        [next],
        tx,
        JSON.stringify(["replay", task.taskId, next.taskId]),
      );
      return { previousTaskId: task.taskId, taskId: next.taskId, kind: task.kind };
    },
    { publishAfterCommit: false },
  );
}
