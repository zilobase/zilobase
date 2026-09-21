import { processCalendarSyncTask } from "../../features/calendar/background";
import { AI_JOB_HANDLERS } from "../../features/ai/jobs/ai-job-handlers";
import { runAiJobById } from "../../features/ai/jobs/ai-jobs";
import { processAgentRun } from "../../features/ai/execution/agent-run-service";
import { processDatabaseAutomationEventWindow } from "../../features/automations/triggers/event-evaluator";
import { processDatabaseAutomationRun } from "../../features/automations/execution/run-engine";
import { processMailIndexTask, processMailDatabaseSyncTask } from "../../features/mail/background";
import { processDatabaseRealtimeTask } from "../../features/databases/realtime/background";
import { processNavigationRealtimeTask } from "../../features/workspaces/navigation-realtime/background";
import { processNotificationTask } from "../../features/notifications/background";
import type { RuntimeEnv } from "../../shared/config/config";
import {
  backgroundTaskLane,
  getBackgroundCellId,
  type BackgroundTaskResult,
  type BackgroundTaskV1,
} from "../../infrastructure/background/contracts";
import { boundedErrorCode } from "../../infrastructure/background/dispatch";
import {
  recordBackgroundCounter,
  recordBackgroundHistogram,
  runBackgroundTaskSpan,
} from "../../infrastructure/background/telemetry";
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
    runtime: (input.env.ZILOBASE_RUNTIME_KIND === "worker" ? "edge" : "node") as
      | "edge"
      | "node",
  };
  recordBackgroundCounter("claim", attributes);
  recordBackgroundHistogram(
    "queue_delay_ms",
    startedAt - Date.parse(input.task.availableAt),
    attributes,
  );
  try {
    const result = await runBackgroundTaskSpan(input.task, attributes, () =>
      processBackgroundTaskInner(input),
    );
    const outcomeAttributes = { ...attributes, outcome: result.outcome };
    recordBackgroundCounter(
      result.outcome === "retry"
        ? "retry"
        : result.outcome === "terminal"
          ? "terminal_failure"
          : "completion",
      outcomeAttributes,
    );
    recordBackgroundHistogram(
      "execution_duration_ms",
      Date.now() - startedAt,
      outcomeAttributes,
    );
    recordBackgroundHistogram(
      "time_beyond_available_at_ms",
      startedAt - Date.parse(input.task.availableAt),
      outcomeAttributes,
    );
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
  const handlers: Record<
    BackgroundTaskV1["kind"],
    () => Promise<BackgroundTaskResult>
  > = {
    "automation.event_window": () =>
      processDatabaseAutomationEventWindow(env, {
        windowId: task.resourceId,
        workerId,
      }),
    "automation.run": () =>
      processDatabaseAutomationRun(env, { runId: task.resourceId, workerId }),
    "agent.run": () =>
      processAgentRun(env, { runId: task.resourceId, workerId }),
    "ai.job": () =>
      runAiJobById({
        env,
        handlers: AI_JOB_HANDLERS,
        jobId: task.resourceId,
        workerId,
      }),
    "calendar.sync": () => processCalendarSyncTask(env, task.resourceId),
    "mail.index": () => processMailIndexTask(env, task.resourceId),
    "mail.database_sync": () =>
      processMailDatabaseSyncTask(env, task.resourceId, workerId),
    "realtime.database": () =>
      processDatabaseRealtimeTask(env, task.resourceId),
    "realtime.navigation": () =>
      processNavigationRealtimeTask(env, task.resourceId),
    "notification.publish": () => processNotificationTask(env, task.resourceId),
  };
  return handlers[task.kind]();
}
