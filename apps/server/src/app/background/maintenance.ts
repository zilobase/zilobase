import { maintainCalendarWatches } from "../../features/calendar/realtime/watches";
import { drainCalendarOutbox } from "../../features/calendar/realtime/outbox";
import { recoverCalendarDispatches } from "../../features/calendar/sync/sync";
import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";

import { cleanupExpiredAiAgentData } from "../../features/ai/actions/agent-operations";
import { enqueueDueAgentSchedules } from "../../features/ai/agents/agent-trigger-service";
import { expireAgentRunApprovals } from "../../features/ai/execution/agent-run-service";
import { cleanupDatabaseAutomationHistory } from "../../features/automations/history/history-maintenance";
import { scanDueDatabaseAutomationSchedules } from "../../features/automations/triggers/scheduler";
import { expireTemporaryMemberships } from "../../features/memberships";

import type { RuntimeEnv } from "../../shared/config/config";
import { boundedErrorCode } from "../../infrastructure/background/dispatch";
import { getBackgroundOperationalSnapshot } from "../../infrastructure/background/health";
import { db } from "../../infrastructure/database";
import { publishBackgroundDispatches } from "../../infrastructure/background/publication";
import { reconcileBackgroundFailures } from "./failures";
import { backgroundMaintenanceTask } from "../../infrastructure/database/schema";

export const BACKGROUND_MAINTENANCE_TASKS = {
  "ai.cleanup": 5 * 60_000,
  "agent.schedules": 60_000,
  "automation.retention": 60 * 60_000,
  "automation.schedules": 60_000,
  "background.reconcile": 60_000,
  "background.snapshot": 60_000,
  "calendar.sync_recovery": 60_000,
  "membership.expiry": 60_000,
} as const;

type MaintenanceTaskKey = keyof typeof BACKGROUND_MAINTENANCE_TASKS;

export async function ensureBackgroundMaintenanceTasks(now = new Date()) {
  await db
    .insert(backgroundMaintenanceTask)
    .values(
      Object.keys(BACKGROUND_MAINTENANCE_TASKS).map((taskKey) => ({
        createdAt: now,
        nextRunAt: now,
        taskKey,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();
}

export async function runDueBackgroundMaintenance(input: {
  env: RuntimeEnv;
  limit?: number;
  workerId: string;
}) {
  await ensureBackgroundMaintenanceTasks();
  const claimed = await db.transaction(async (tx) => {
    const clock = await tx.execute(sql<{ now: Date }>`select current_timestamp as now`);
    const rawNow = clock.rows[0]?.now as Date | string | undefined;
    const now = rawNow ? new Date(rawNow) : new Date();
    const leaseExpiresAt = new Date(now.getTime() + 2 * 60_000);
    const due = await tx
      .select()
      .from(backgroundMaintenanceTask)
      .where(
        and(
          lte(backgroundMaintenanceTask.nextRunAt, now),
          or(
            isNull(backgroundMaintenanceTask.leaseExpiresAt),
            lt(backgroundMaintenanceTask.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(backgroundMaintenanceTask.nextRunAt))
      .limit(Math.max(1, Math.min(input.limit ?? 9, 20)))
      .for("update", { skipLocked: true });
    const rows = [];
    for (const task of due) {
      const [row] = await tx
        .update(backgroundMaintenanceTask)
        .set({
          lastStartedAt: now,
          leaseExpiresAt,
          leaseOwner: input.workerId,
          updatedAt: now,
        })
        .where(eq(backgroundMaintenanceTask.taskKey, task.taskKey))
        .returning();
      if (row) rows.push(row);
    }
    return rows;
  });

  for (const task of claimed) {
    const taskKey = task.taskKey as MaintenanceTaskKey;
    try {
      const nextDelay = await executeMaintenanceTask(input.env, taskKey, input.workerId);
      const finishedAt = new Date();
      await db
        .update(backgroundMaintenanceTask)
        .set({
          consecutiveFailures: 0,
          lastErrorCode: null,
          lastSucceededAt: finishedAt,
          leaseExpiresAt: null,
          leaseOwner: null,
          nextRunAt: new Date(
            finishedAt.getTime() + (nextDelay ?? BACKGROUND_MAINTENANCE_TASKS[taskKey]),
          ),
          updatedAt: finishedAt,
        })
        .where(
          and(
            eq(backgroundMaintenanceTask.taskKey, taskKey),
            eq(backgroundMaintenanceTask.leaseOwner, input.workerId),
          ),
        );
    } catch (error) {
      const finishedAt = new Date();
      await db
        .update(backgroundMaintenanceTask)
        .set({
          consecutiveFailures: task.consecutiveFailures + 1,
          lastErrorCode: boundedErrorCode(error),
          lastFailedAt: finishedAt,
          leaseExpiresAt: null,
          leaseOwner: null,
          nextRunAt: new Date(
            finishedAt.getTime() + Math.min(60_000, 1_000 * 2 ** task.consecutiveFailures),
          ),
          updatedAt: finishedAt,
        })
        .where(
          and(
            eq(backgroundMaintenanceTask.taskKey, taskKey),
            eq(backgroundMaintenanceTask.leaseOwner, input.workerId),
          ),
        );
      console.warn(
        JSON.stringify({
          code: boundedErrorCode(error),
          event: "background.maintenance",
          outcome: "failed",
          task: taskKey,
        }),
      );
    }
  }
  return { claimed: claimed.length };
}

async function executeMaintenanceTask(env: RuntimeEnv, task: MaintenanceTaskKey, workerId: string) {
  return MAINTENANCE_TASK_HANDLERS[task](env, workerId);
}

type MaintenanceTaskHandler = (env: RuntimeEnv, workerId: string) => Promise<number | void>;

const MAINTENANCE_TASK_HANDLERS: Record<MaintenanceTaskKey, MaintenanceTaskHandler> = {
  "agent.schedules": async (env) => {
    await enqueueDueAgentSchedules(env);
    await expireAgentRunApprovals();
  },
  "background.reconcile": async (env) => {
    await reconcileBackgroundFailures(env);
    await publishBackgroundDispatches(env);
  },
  "automation.schedules": async (env) => {
    await scanDueDatabaseAutomationSchedules(env, { limit: 50 });
  },
  "membership.expiry": async () => {
    await expireTemporaryMemberships();
  },
  "calendar.sync_recovery": async (env) => {
    await recoverCalendarDispatches(env);
    await maintainCalendarWatches(env);
    await drainCalendarOutbox();
  },
  "ai.cleanup": async (env) => {
    await cleanupExpiredAiAgentData(env);
  },
  "automation.retention": async (env) => {
    const result = await cleanupDatabaseAutomationHistory(env);
    return Object.entries(result).some(
      ([key, value]) => key !== "retention" && typeof value === "number" && value > 0,
    )
      ? 60_000
      : undefined;
  },
  "background.snapshot": async (env) => {
    const snapshot = await getBackgroundOperationalSnapshot(env);
    console.info(JSON.stringify({ event: "background.heartbeat", snapshot }));
  },
};
