import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { backgroundDispatch } from "../../infrastructure/database/schema";
import { backgroundTransaction } from "../../infrastructure/background/publication";
import { decodeBackgroundTaskV2 } from "../../infrastructure/background/task-v2";
import {
  getBackgroundCellId,
  backgroundTaskLane,
  type BackgroundLane,
} from "../../infrastructure/background/contracts";
import type { RuntimeEnv } from "../../shared/config/config";
import { failAiJobDelivery } from "../../features/ai/jobs/delivery-failure";
import { failAgentDelivery } from "../../features/ai/execution/delivery-failure";
import { failAutomationDelivery } from "../../features/automations/execution/delivery-failure";
import { failCalendarDelivery } from "../../features/calendar/delivery-failure";
import { failDatabaseRealtimeDelivery } from "../../features/databases/realtime/background";
import { failNotificationDelivery } from "../../features/notifications/background";

export async function recordBackgroundExhaustion(
  env: RuntimeEnv,
  body: unknown,
  lane: BackgroundLane,
) {
  const task = decodeBackgroundTaskV2(body, getBackgroundCellId(env));
  if (backgroundTaskLane(task.kind) !== lane) throw new Error("BACKGROUND_TASK_LANE_MISMATCH");
  await backgroundTransaction(env, async (tx) => {
    const [row] = await tx
      .select()
      .from(backgroundDispatch)
      .where(
        and(eq(backgroundDispatch.id, task.taskId), eq(backgroundDispatch.cellId, task.cellId)),
      )
      .for("update");
    if (!row) throw new Error("BACKGROUND_TASK_NOT_ADMITTED");
    if (Object.entries(task).some(([key, value]) => value !== row.task[key as keyof typeof task]))
      throw new Error("BACKGROUND_TASK_PERSISTED_MISMATCH");
    if (["completed", "terminal", "cancelled"].includes(row.status)) return;
    await tx
      .update(backgroundDispatch)
      .set({
        status: "exhausted",
        errorCode: "TRANSPORT_RETRIES_EXHAUSTED",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundDispatch.id, row.id));
  });
  await reconcileBackgroundFailures(env);
}

export async function reconcileBackgroundFailures(env: RuntimeEnv) {
  // One locked dispatch record and its feature failure update commit together.
  return backgroundTransaction(env, async (tx) => {
    const rows = await tx
      .select()
      .from(backgroundDispatch)
      .where(
        and(
          eq(backgroundDispatch.cellId, getBackgroundCellId(env)),
          eq(backgroundDispatch.status, "exhausted"),
          isNull(backgroundDispatch.failureHandledAt),
          or(
            isNull(backgroundDispatch.leaseExpiresAt),
            lte(backgroundDispatch.leaseExpiresAt, sql`current_timestamp`),
          ),
        ),
      )
      .orderBy(asc(backgroundDispatch.completedAt))
      .limit(100)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      let handled: boolean;
      switch (row.task.kind) {
        case "ai.job":
          handled = await failAiJobDelivery(row.resourceId);
          break;
        case "agent.run":
          handled = await failAgentDelivery(row.resourceId);
          break;
        case "automation.run":
          handled = await failAutomationDelivery(row.resourceId, false);
          break;
        case "automation.event_window":
          handled = await failAutomationDelivery(row.resourceId, true);
          break;
        case "calendar.sync":
          handled = await failCalendarDelivery(row.resourceId, row.task.availableAt);
          break;
        case "realtime.database":
          handled = await failDatabaseRealtimeDelivery(row.resourceId);
          break;
        case "notification.publish":
          handled = await failNotificationDelivery(row.resourceId);
          break;
      }
      if (handled)
        await tx
          .update(backgroundDispatch)
          .set({ failureHandledAt: new Date(), leaseOwner: null, leaseExpiresAt: null })
          .where(
            and(eq(backgroundDispatch.id, row.id), eq(backgroundDispatch.status, "exhausted")),
          );
    }
    return { examined: rows.length };
  });
}
