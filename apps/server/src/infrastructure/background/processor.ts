import { eq } from "drizzle-orm";

import { AI_JOB_HANDLERS } from "../../features/ai/jobs/ai-job-handlers";
import { runAiJobById } from "../../features/ai/jobs/ai-jobs";
import { processDatabaseAutomationEventWindow } from "../../features/databases/automations/evaluator";
import { processDatabaseAutomationRun } from "../../features/databases/automations/run-engine";
import { drainDatabaseRealtimeOutbox } from "../../features/databases/realtime/outbox";
import { advanceMailIndex, publishMailIndexUpdate } from "../../features/mail/mail-index";
import { drainMailDatabaseSyncOutbox } from "../../features/mail/mail-database-sync-worker";
import { drainInProductNotificationOutbox } from "../../features/notifications/outbox";
import { drainNavigationRealtimeOutbox } from "../../features/workspaces/navigation-realtime/outbox";
import type { RuntimeEnv } from "../../shared/config/config";
import { db } from "../database";
import {
  databaseRealtimeOutbox,
  gmailAccount,
  inProductNotificationOutbox,
  mailDatabaseSyncOutbox,
  mailIndexState,
  navigationRealtimeOutbox,
} from "../database/schema";
import { backgroundTaskLane, getBackgroundCellId, type BackgroundTaskResult, type BackgroundTaskV1 } from "./contracts";
import { boundedErrorCode } from "./dispatch";
import { recordBackgroundCounter, recordBackgroundHistogram, runBackgroundTaskSpan } from "./telemetry";

export async function processBackgroundTask(input: {
  env: RuntimeEnv;
  task: BackgroundTaskV1;
  workerId: string;
}): Promise<BackgroundTaskResult> {
  const startedAt = Date.now();
  const attributes = {
    cell: getBackgroundCellId(input.env),
    kind: input.task.kind,
    lane: backgroundTaskLane(input.task.kind),
    outcome: "claimed",
    runtime: (input.env.HYPERDRIVE ? "cloudflare" : "node") as "cloudflare" | "node",
  };
  recordBackgroundCounter("claim", attributes);
  recordBackgroundHistogram("queue_delay_ms", startedAt - Date.parse(input.task.availableAt), attributes);
  try {
    const result = await runBackgroundTaskSpan(input.task, attributes, () =>
      processBackgroundTaskInner(input)
    );
    const outcomeAttributes = { ...attributes, outcome: result.outcome };
    recordBackgroundCounter(
      result.outcome === "retry" ? "retry" : result.outcome === "terminal" ? "terminal_failure" : "completion",
      outcomeAttributes,
    );
    recordBackgroundHistogram("execution_duration_ms", Date.now() - startedAt, outcomeAttributes);
    recordBackgroundHistogram("time_beyond_available_at_ms", startedAt - Date.parse(input.task.availableAt), outcomeAttributes);
    return result;
  } catch (error) {
    recordBackgroundCounter("retry", {
      ...attributes,
      error_code: boundedErrorCode(error),
      outcome: "error",
    });
    throw error;
  }
}

async function processBackgroundTaskInner(input: {
  env: RuntimeEnv;
  task: BackgroundTaskV1;
  workerId: string;
}): Promise<BackgroundTaskResult> {
  const { env, task, workerId } = input;
  switch (task.kind) {
    case "automation.event_window":
      return processDatabaseAutomationEventWindow(env, { windowId: task.resourceId, workerId });
    case "automation.run":
      return processDatabaseAutomationRun(env, { runId: task.resourceId, workerId });
    case "ai.job":
      return runAiJobById({ env, handlers: AI_JOB_HANDLERS, jobId: task.resourceId, workerId });
    case "mail.index": {
      const [account] = await db.select({ id: gmailAccount.id, status: gmailAccount.status }).from(gmailAccount)
        .where(eq(gmailAccount.id, task.resourceId)).limit(1);
      if (!account || account.status !== "connected") return { outcome: "noop" };
      await advanceMailIndex(env, account.id);
      await publishMailIndexUpdate(env, account.id);
      const [state] = await db.select({ status: mailIndexState.status }).from(mailIndexState)
        .where(eq(mailIndexState.gmailAccountId, account.id)).limit(1);
      return state?.status === "ready"
        ? { outcome: "completed" }
        : { availableAt: new Date(Date.now() + 5_000).toISOString(), outcome: "retry" };
    }
    case "mail.database_sync":
      await drainMailDatabaseSyncOutbox(env, { limit: 1, outboxId: task.resourceId, workerId });
      return resultForDueRow(async () => (await db.select({
        nextAttemptAt: mailDatabaseSyncOutbox.nextAttemptAt,
        status: mailDatabaseSyncOutbox.status,
      })
        .from(mailDatabaseSyncOutbox).where(eq(mailDatabaseSyncOutbox.id, task.resourceId)).limit(1))[0]);
    case "realtime.database":
      await drainDatabaseRealtimeOutbox(env, { limit: 1, outboxId: task.resourceId });
      return resultForDueRow(async () => (await db.select({ nextAttemptAt: databaseRealtimeOutbox.nextAttemptAt })
        .from(databaseRealtimeOutbox).where(eq(databaseRealtimeOutbox.id, task.resourceId)).limit(1))[0]);
    case "realtime.navigation":
      await drainNavigationRealtimeOutbox(env, { limit: 1, outboxId: task.resourceId });
      return resultForDueRow(async () => (await db.select({ nextAttemptAt: navigationRealtimeOutbox.nextAttemptAt })
        .from(navigationRealtimeOutbox).where(eq(navigationRealtimeOutbox.id, task.resourceId)).limit(1))[0]);
    case "notification.publish":
      await drainInProductNotificationOutbox(env, { limit: 1, outboxId: task.resourceId });
      return resultForDueRow(async () => (await db.select({
        nextAttemptAt: inProductNotificationOutbox.nextAttemptAt,
        status: inProductNotificationOutbox.status,
      })
        .from(inProductNotificationOutbox).where(eq(inProductNotificationOutbox.id, task.resourceId)).limit(1))[0]);
  }
}

async function resultForDueRow(
  load: () => Promise<{ nextAttemptAt: Date; status?: string } | undefined>,
): Promise<BackgroundTaskResult> {
  const row = await load();
  if (!row) return { outcome: "completed" };
  if (row.status && !["pending", "processing", "retry"].includes(row.status)) {
    return { outcome: "completed" };
  }
  return { availableAt: row.nextAttemptAt.toISOString(), outcome: "retry" };
}
