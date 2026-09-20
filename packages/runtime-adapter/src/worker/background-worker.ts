import {
  backgroundTaskLane,
  getBackgroundCellId,
  parseBackgroundTask,
  processBackgroundTask,
  runDueBackgroundMaintenance,
  runWithBackgroundTraceContext,
  runWithDbEnv,
  runWithRuntimeAdapter,
  runWithRuntimePorts,
  setRuntimeAdapter,
  type AppBindings,
  type BackgroundLane,
} from "@zilobase/server/adapter-api";

import {
  createWorkerAdapter,
  type WorkerEnvBindings,
} from "./adapter";
import { createWorkerJobs } from "./jobs";
import { createWorkerTelemetry } from "./telemetry";

export type BackgroundWorkerOptions<Env extends WorkerEnvBindings = WorkerEnvBindings> = {
  reportError?: (env: Env, error: unknown, context: Record<string, unknown>) => void | Promise<void>;
  reportEvent?: (env: Env, event: string, props?: Record<string, unknown>) => void | Promise<void>;
};

const queueLanes: Record<string, BackgroundLane> = {
  "zilobase-ai-jobs": "ai",
  "zilobase-automation-runs": "automation",
  "zilobase-background-fast": "fast",
  "zilobase-mail-jobs": "mail",
};

export function createBackgroundWorker<Env extends WorkerEnvBindings = WorkerEnvBindings>(
  opts: BackgroundWorkerOptions<Env> = {},
): {
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void>;
  scheduled(controller: ScheduledController, env: Env): Promise<void>;
} {
  const adapter = createWorkerAdapter({ publishDatabaseMutations: true });
  setRuntimeAdapter(adapter);

  const telemetryFor = (env: Env) => createWorkerTelemetry({
    env,
    reportError: opts.reportError,
    reportEvent: opts.reportEvent,
  });

  return {
    async queue(batch: MessageBatch<unknown>, env: Env) {
      try {
        const expectedLane = queueLanes[batch.queue];
        await runWithRuntimePorts({
          jobs: createWorkerJobs(env),
          telemetry: telemetryFor(env),
        }, () =>
          runWithRuntimeAdapter(adapter, () =>
            runWithDbEnv(env, async () => {
            await Promise.all(
              batch.messages.map(async (message) => {
                const parsed = parseBackgroundTask(
                  message.body,
                  getBackgroundCellId(env),
                );
                if (
                  !parsed.ok ||
                  !expectedLane ||
                  backgroundTaskLane(parsed.task.kind) !== expectedLane
                ) {
                  await telemetryFor(env).event("background_task_terminal", {
                    code: parsed.ok
                      ? "BACKGROUND_TASK_LANE_MISMATCH"
                      : parsed.errorCode,
                    queue: batch.queue,
                  });
                  console.warn(
                    JSON.stringify({
                      code: parsed.ok
                        ? "BACKGROUND_TASK_LANE_MISMATCH"
                        : parsed.errorCode,
                      event: "background.message",
                      messageId: message.id,
                      outcome: "terminal",
                    }),
                  );
                  message.ack();
                  return;
                }
                try {
                  const result = await runWithBackgroundTraceContext(
                    parsed.task,
                    () =>
                      processBackgroundTask({
                        env,
                        task: parsed.task,
                        workerId: `cloudflare:${expectedLane}:${crypto.randomUUID()}`,
                      }),
                  );
                  if (result.outcome === "retry") {
                    message.retry({
                      delaySeconds: retryDelaySeconds(result.availableAt),
                    });
                    return;
                  }
                  message.ack();
                  if (result.outcome === "terminal") {
                    await telemetryFor(env).event("background_task_terminal", {
                      code: result.errorCode ?? "BACKGROUND_TASK_TERMINAL",
                      kind: parsed.task.kind,
                    });
                    console.warn(
                      JSON.stringify({
                        code: result.errorCode ?? "BACKGROUND_TASK_TERMINAL",
                        event: "background.message",
                        kind: parsed.task.kind,
                        outcome: "terminal",
                      }),
                    );
                  }
                } catch (error) {
                  await telemetryFor(env).error(error, {
                    code: boundedErrorCode(error),
                    kind: parsed.task.kind,
                    outcome: "retry",
                  });
                  console.warn(
                    JSON.stringify({
                      code: boundedErrorCode(error),
                      event: "background.message",
                      kind: parsed.task.kind,
                      outcome: "retry",
                    }),
                  );
                  message.retry();
                }
              }),
            );
            }),
          ),
        );
      } catch (error) {
        await telemetryFor(env).error(error, {
          queue: batch.queue,
        });
        throw error;
      }
    },
    async scheduled(_controller: ScheduledController, env: Env) {
      try {
        await runWithRuntimePorts({
          jobs: createWorkerJobs(env),
          telemetry: telemetryFor(env),
        }, () =>
          runWithRuntimeAdapter(adapter, () =>
            runWithDbEnv(env, async () => {
            const result = await runDueBackgroundMaintenance({
              env,
              workerId: `cloudflare-maintenance:${crypto.randomUUID()}`,
            });
            if (result.claimed) {
              console.info(
                JSON.stringify({
                  claimed: result.claimed,
                  event: "background.maintenance",
                  outcome: "completed",
                }),
              );
            }
            }),
          ),
        );
      } catch (error) {
        await telemetryFor(env).error(error, {
          trigger: "scheduled",
        });
        throw error;
      }
    },
  };
}

function retryDelaySeconds(availableAt: string) {
  return Math.max(
    1,
    Math.min(43_200, Math.ceil((Date.parse(availableAt) - Date.now()) / 1_000)),
  );
}

function boundedErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code)
      .replace(/[^A-Z0-9_.-]/gi, "_")
      .slice(0, 80);
  }
  return error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN";
}

export type { AppBindings };
