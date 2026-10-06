import {
  BACKGROUND_LANE_POLICY,
  backgroundTaskLane,
  getBackgroundCellId,
  parseBackgroundTask,
  deliverBackgroundTask,
  recordBackgroundExhaustion,
  publishBackgroundDispatches,
  runDueBackgroundMaintenance,
  runWithBackgroundTraceContext,
  runWithDbEnv,
  runWithRuntimePorts,
  type AppBindings,
  type BackgroundLane,
} from "@zilobase/server/adapter-api";

import type { WorkerEnvBindings } from "./bindings";
import { createWorkerJobs } from "./jobs";
import { createWorkerTelemetry } from "./telemetry";
import { createWorkerFanout } from "./fanout";
import { createWorkerMeetings } from "./meetings";
import { createRuntimeEnv } from "../env";
import { createUrlResolver } from "../url-resolver";
import { createWorkerImageStorage } from "./image-storage";
import { createWorkerMailer } from "./mailer";
import { createWorkerOutboundFetch } from "./outbound-fetch";
import { createWorkerDocuments } from "./documents";

export type BackgroundWorkerOptions<Env extends WorkerEnvBindings = WorkerEnvBindings> = {
  reportError?: (
    env: Env,
    error: unknown,
    context: Record<string, unknown>,
  ) => void | Promise<void>;
  reportEvent?: (env: Env, event: string, props?: Record<string, unknown>) => void | Promise<void>;
};

const queueLanes: Record<string, BackgroundLane> = {
  "zilobase-ai-jobs": "ai",
  "zilobase-automation-runs": "automation",
  "zilobase-background-fast": "fast",
  "zilobase-calendar-jobs": "calendar",
};

export function createBackgroundWorker<Env extends WorkerEnvBindings = WorkerEnvBindings>(
  opts: BackgroundWorkerOptions<Env> = {},
): {
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void>;
  scheduled(controller: ScheduledController, env: Env): Promise<void>;
} {
  const telemetryFor = (env: Env) =>
    createWorkerTelemetry({
      env,
      reportError: opts.reportError,
      reportEvent: opts.reportEvent,
    });

  const portsFor = (env: Env): Partial<import("@zilobase/runtime-ports").Ports> => {
    const runtimeEnv = createRuntimeEnv(env, {
      DATABASE_URL: () => env.HYPERDRIVE?.connectionString,
      ZILOBASE_EDITION: () => "hosted",
    });
    return {
      ...(env.IMAGE_BUCKET ? { blobs: createWorkerImageStorage(env.IMAGE_BUCKET) } : {}),
      documents: createWorkerDocuments(env),
      env: runtimeEnv,
      jobs: createWorkerJobs(env),
      fanout: createWorkerFanout(env),
      mailer: createWorkerMailer({
        binding: env.EMAIL,
        developmentSinkUrl: env.ZILOBASE_DEV_EMAIL_SINK_URL,
      }),
      meetings: createWorkerMeetings(env),
      outbound: createWorkerOutboundFetch(),
      readiness: {
        background: () => ({
          producerReady: !!(
            env.BACKGROUND_FAST &&
            env.AUTOMATION_RUNS &&
            env.AI_JOBS &&
            env.CALENDAR_JOBS
          ),
          consumerReady: null,
          maintenanceFresh: null,
        }),
        realtime: () => true,
      },
      telemetry: telemetryFor(env),
      urls: createUrlResolver(runtimeEnv),
    };
  };

  return {
    async queue(batch: MessageBatch<unknown>, env: Env) {
      try {
        const deadLetter = batch.queue.endsWith("-dlq");
        const expectedLane = queueLanes[deadLetter ? batch.queue.slice(0, -4) : batch.queue];
        await runWithRuntimePorts(portsFor(env), () =>
          Promise.all(
            batch.messages.map((message) =>
              runWithDbEnv(env, async () => {
                const parsed = parseBackgroundTask(message.body, getBackgroundCellId(env));
                if (
                  !parsed.ok ||
                  !expectedLane ||
                  backgroundTaskLane(parsed.task.kind) !== expectedLane
                ) {
                  await telemetryFor(env).event("background_task_terminal", {
                    code: parsed.ok ? "BACKGROUND_TASK_LANE_MISMATCH" : parsed.errorCode,
                    queue: batch.queue,
                  });
                  message.ack();
                  return;
                }
                try {
                  if (deadLetter) {
                    await recordBackgroundExhaustion(env, parsed.task, expectedLane);
                    message.ack();
                    return;
                  }
                  const result = await runWithBackgroundTraceContext(parsed.task, () =>
                    deliverBackgroundTask(
                      env,
                      parsed.task,
                      expectedLane,
                      `cloudflare:${expectedLane}:${message.id}:${crypto.randomUUID()}`,
                    ),
                  );
                  if (result.outcome === "defer")
                    message.retry({ delaySeconds: retryDelaySeconds(result.availableAt) });
                  else message.ack();
                } catch (error) {
                  if (
                    !deadLetter &&
                    message.attempts >= BACKGROUND_LANE_POLICY[expectedLane].redeliveries + 1
                  ) {
                    try {
                      await recordBackgroundExhaustion(env, parsed.task, expectedLane);
                    } catch (recordingError) {
                      await telemetryFor(env).error(recordingError, {
                        code: "BACKGROUND_EXHAUSTION_RECORDING_FAILED",
                        kind: parsed.task.kind,
                      });
                    }
                  }
                  await telemetryFor(env).error(error, {
                    code: boundedErrorCode(error),
                    kind: parsed.task.kind,
                    outcome: "retry",
                    deadLetter,
                  });
                  message.retry(deadLetter ? { delaySeconds: 30 } : undefined);
                }
              }),
            ),
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
        await runWithRuntimePorts(portsFor(env), () =>
          runWithDbEnv(env, async () => {
            await publishBackgroundDispatches(env);
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
  return Math.max(1, Math.min(43_200, Math.ceil((Date.parse(availableAt) - Date.now()) / 1_000)));
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
