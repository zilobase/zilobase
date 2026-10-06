import { Queue, Worker, DelayedError, UnrecoverableError, createIORedisClient } from "bullmq";
import Redis from "ioredis";
import type {
  BackgroundLane,
  BackgroundTask,
  Jobs,
  BackgroundReadiness,
} from "@zilobase/runtime-ports";

export const NODE_BACKGROUND_QUEUE_NAMES: Record<BackgroundLane, string> = {
  fast: "background-fast",
  automation: "automation-runs",
  ai: "ai-jobs",
  calendar: "calendar-jobs",
};
const LANES = Object.keys(NODE_BACKGROUND_QUEUE_NAMES) as BackgroundLane[];
export type NodeQueueRuntime = ReturnType<typeof createNodeQueueRuntime>;
export type NodeQueueCallbacks = {
  lane(task: BackgroundTask): BackgroundLane;
  validate(body: unknown): BackgroundTask;
  policy: Record<BackgroundLane, { concurrency: number; redeliveries: number }>;
  deliver(
    body: unknown,
    lane: BackgroundLane,
    workerId: string,
  ): Promise<{ outcome: "ack" } | { outcome: "defer"; availableAt: string }>;
  exhausted(body: unknown, lane: BackgroundLane): Promise<void>;
  maintain(): Promise<unknown>;
};

const brokerHost = (url: URL) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? "loopback" : url.hostname;

export function getQueueRedisUrl(env: Record<string, unknown>) {
  const value = env.QUEUE_REDIS_URL;
  try {
    if (typeof value !== "string" || !["redis:", "rediss:"].includes(new URL(value).protocol))
      throw new Error();
    if (
      typeof env.REALTIME_REDIS_URL === "string" &&
      brokerHost(new URL(value)) === brokerHost(new URL(env.REALTIME_REDIS_URL)) &&
      (new URL(value).port || "6379") === (new URL(env.REALTIME_REDIS_URL).port || "6379")
    )
      throw new Error();
    return value;
  } catch {
    throw new Error(
      "QUEUE_REDIS_URL is required for every Node role and must identify dedicated queue Redis using redis:// or rediss://",
    );
  }
}

export function createNodeQueueRuntime(
  env: Record<string, unknown>,
  callbacks: NodeQueueCallbacks,
) {
  const url = getQueueRedisUrl(env);
  const cell =
    typeof env.ZILOBASE_CELL_ID === "string" && env.ZILOBASE_CELL_ID.trim()
      ? env.ZILOBASE_CELL_ID.trim()
      : "default";
  const prefix = `zilobase:${encodeURIComponent(cell)}`;
  const role = env.ZILOBASE_PROCESS_ROLE ?? "all";
  const producer = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
  });
  const connection = createIORedisClient(producer);
  const queues = new Map(
    LANES.map((lane) => [
      lane,
      new Queue(NODE_BACKGROUND_QUEUE_NAMES[lane], { connection, prefix }),
    ]),
  );
  const consumers: Worker[] = [];
  const consumerClients: Redis[] = [];
  const inFlight = new Set<Promise<unknown>>();
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastMaintenanceAt: number | null = null;
  let maintenanceBusy = false;
  const failureCursor = new Map<BackgroundLane, number>();
  const log = (error: unknown) =>
    console.warn(
      JSON.stringify({
        event: "background.queue_failure",
        cell,
        error: error instanceof Error ? error.name : "UNKNOWN",
        detail:
          error instanceof Error
            ? error.message.replace(/rediss?:\/\/\S+/g, "[redacted]").slice(0, 200)
            : "",
      }),
    );
  producer.on("error", log);
  for (const queue of queues.values()) queue.on("error", log);
  const track = <T>(promise: Promise<T>) => {
    inFlight.add(promise);
    void promise.then(
      () => inFlight.delete(promise),
      () => inFlight.delete(promise),
    );
    return promise;
  };
  async function maintenance() {
    if (!running || maintenanceBusy) return;
    maintenanceBusy = true;
    try {
      // Failed-job events are best effort; scanning retained failures repairs an interrupted failure hook.
      for (const lane of LANES) {
        const offset = failureCursor.get(lane) ?? 0;
        const failures = await queues.get(lane)!.getFailed(offset, offset + 49);
        failureCursor.set(lane, failures.length < 50 ? 0 : offset + 50);
        for (const job of failures) {
          if (job.failedReason === "BACKGROUND_INVALID_ENVELOPE") continue;
          await callbacks.exhausted(job.data, lane);
        }
      }
      await callbacks.maintain();
      lastMaintenanceAt = Date.now();
    } catch (error) {
      log(error);
    } finally {
      maintenanceBusy = false;
      if (running) {
        timer = setTimeout(() => {
          void track(maintenance());
        }, 5000);
        timer.unref();
      }
    }
  }
  const jobs: Jobs = {
    async dispatch(tasks) {
      if (!running) throw new Error("BACKGROUND_QUEUE_STOPPED");
      if (producer.status !== "ready") throw new Error("BACKGROUND_QUEUE_UNAVAILABLE");
      await Promise.all(
        tasks.map(async (raw) => {
          const task = callbacks.validate(raw);
          const lane = callbacks.lane(task);
          await queues.get(lane)!.add(task.kind, task, {
            jobId: task.taskId,
            delay: Math.max(0, Date.parse(task.availableAt) - Date.now()),
            attempts: callbacks.policy[lane].redeliveries + 1,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: { age: 86_400 },
            removeOnFail: { age: 604_800 },
          });
        }),
      );
    },
  };
  return {
    ...jobs,
    queues,
    readiness(): BackgroundReadiness {
      return {
        producerReady: running && producer.status === "ready",
        consumerReady:
          role === "api"
            ? null
            : running &&
              consumers.length === 4 &&
              consumerClients.every((client) => client.status === "ready"),
        maintenanceFresh:
          role === "api"
            ? null
            : lastMaintenanceAt !== null && Date.now() - lastMaintenanceAt < 120_000,
      };
    },
    metrics() {
      const state = this.readiness();
      return Object.entries(state)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => {
          const metric = `zilobase_background_queue_${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
          return `# TYPE ${metric} gauge\n${metric} ${value ? 1 : 0}\n`;
        })
        .join("");
    },
    async start() {
      if (running) return;
      running = true;
      // Startup is bounded; unavailable Redis leaves readiness false while connections reconnect.
      await Promise.race([
        Promise.all([...queues.values()].map((queue) => queue.waitUntilReady())),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]).catch(log);
      if (role === "api") return;
      for (const lane of LANES) {
        const client = new Redis(url, { maxRetriesPerRequest: null, connectTimeout: 2000 });
        consumerClients.push(client);
        client.on("error", log);
        const workerId = `node:${process.pid}:${crypto.randomUUID()}:${lane}`;
        const override = Number(env[`ZILOBASE_BACKGROUND_${lane.toUpperCase()}_CONCURRENCY`]);
        const concurrency =
          Number.isInteger(override) && override > 0
            ? Math.min(override, 50)
            : callbacks.policy[lane].concurrency;
        const worker = new Worker(
          NODE_BACKGROUND_QUEUE_NAMES[lane],
          async (job, token) => {
            try {
              callbacks.validate(job.data);
            } catch {
              throw new UnrecoverableError("BACKGROUND_INVALID_ENVELOPE");
            }
            try {
              const result = await callbacks.deliver(job.data, lane, `${workerId}:${job.id}`);
              if (result.outcome === "defer") {
                await job.moveToDelayed(
                  Math.max(Date.now() + 1000, Date.parse(result.availableAt)),
                  token,
                );
                throw new DelayedError();
              }
            } catch (error) {
              if (error instanceof DelayedError) throw error;
              if (
                error instanceof Error &&
                [
                  "BACKGROUND_TASK_NOT_ADMITTED",
                  "BACKGROUND_TASK_PERSISTED_MISMATCH",
                  "BACKGROUND_TASK_CELL_MISMATCH",
                  "BACKGROUND_TASK_LANE_MISMATCH",
                ].includes(error.message)
              )
                throw new UnrecoverableError("BACKGROUND_INVALID_ENVELOPE");
              if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
                try {
                  await callbacks.exhausted(job.data, lane);
                } catch (recordingError) {
                  log(recordingError);
                  await job.moveToDelayed(Date.now() + 30_000, token);
                  throw new DelayedError();
                }
              }
              throw error;
            }
          },
          { prefix, connection: createIORedisClient(client), concurrency },
        );
        worker.on("error", log);
        worker.on("failed", (job, error) => {
          if (error.message === "BACKGROUND_INVALID_ENVELOPE") return;
          if (job && job.attemptsMade >= (job.opts.attempts ?? 1))
            void track(callbacks.exhausted(job.data, lane)).catch(log);
        });
        consumers.push(worker);
      }
      void track(maintenance());
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled([...consumers.map((worker) => worker.close()), ...inFlight]),
          new Promise<void>((resolve) => {
            deadline = setTimeout(resolve, 30_000);
          }),
        ]);
        await Promise.allSettled(consumers.map((worker) => worker.disconnect()));
        await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
      } finally {
        if (deadline) clearTimeout(deadline);
        producer.disconnect();
        for (const client of consumerClients) client.disconnect();
      }
    },
  };
}
