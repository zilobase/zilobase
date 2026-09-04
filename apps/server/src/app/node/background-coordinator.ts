import { eq, inArray, min, sql } from "drizzle-orm";

import { AI_JOB_HANDLERS } from "../../features/ai/jobs/ai-job-handlers";
import { runAiJobBatch } from "../../features/ai/jobs/ai-jobs";
import { drainDatabaseAutomationEventWindows } from "../../features/databases/automations/evaluator";
import { drainDatabaseAutomationRuns } from "../../features/databases/automations/run-engine";
import { drainDatabaseRealtimeOutbox } from "../../features/databases/realtime/outbox";
import { advancePendingMailIndexes } from "../../features/mail/mail-index";
import { drainMailDatabaseSyncOutbox } from "../../features/mail/mail-database-sync-worker";
import { drainInProductNotificationOutbox } from "../../features/notifications/outbox";
import { drainNavigationRealtimeOutbox } from "../../features/workspaces/navigation-realtime/outbox";
import { type RuntimeEnv } from "../../shared/config/config";
import { db, createDbClientForUrl, runWithDbEnv } from "../../infrastructure/database";
import {
  aiJob,
  databaseAutomationEventWindow,
  databaseAutomationRun,
  databaseRealtimeOutbox,
  inProductNotificationOutbox,
  mailDatabaseSyncOutbox,
  navigationRealtimeOutbox,
} from "../../infrastructure/database/schema";
import { getDatabaseUrl } from "../../infrastructure/runtime/runtime-adapter";
import { runDueBackgroundMaintenance } from "../background/maintenance";
import { backgroundTaskLane, type BackgroundLane, type BackgroundTaskV1 } from "../../infrastructure/background/contracts";
import { boundedErrorCode } from "../../infrastructure/background/dispatch";

const CHANNEL = "zilobase_background_v1";
const LANES: BackgroundLane[] = ["fast", "automation", "ai", "mail"];

export type NodeBackgroundCoordinator = ReturnType<typeof createNodeBackgroundCoordinator>;

export function createNodeBackgroundCoordinator(env: RuntimeEnv) {
  const workerId = `node-background:${process.pid}:${crypto.randomUUID()}`;
  const timers = new Map<BackgroundLane, ReturnType<typeof setTimeout>>();
  const timerDueAt = new Map<BackgroundLane, number>();
  const inFlight = new Set<Promise<unknown>>();
  let listener: ReturnType<typeof createDbClientForUrl>["client"] | null = null;
  let listenerReady = false;
  let running = false;
  let stopping = false;
  let reconnectAttempt = 0;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  const track = <T>(promise: Promise<T>) => {
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
    return promise;
  };

  const scheduleLane = (lane: BackgroundLane, availableAt = new Date()) => {
    if (stopping) return;
    const current = timers.get(lane);
    const requestedAt = availableAt.getTime();
    if (current && (timerDueAt.get(lane) ?? Number.POSITIVE_INFINITY) <= requestedAt) return;
    if (current) clearTimeout(current);
    const delay = Math.max(0, Math.min(2_147_000_000, requestedAt - Date.now()));
    const timer = setTimeout(() => {
      timers.delete(lane);
      timerDueAt.delete(lane);
      track(drainLane(lane));
    }, delay);
    timer.unref();
    timers.set(lane, timer);
    timerDueAt.set(lane, requestedAt);
  };

  const drainLane = async (lane: BackgroundLane) => {
    if (stopping) return;
    try {
      await runWithDbEnv(env, async () => {
        const concurrency = laneConcurrency(env, lane);
        if (lane === "fast") {
          await Promise.allSettled([
            drainDatabaseAutomationEventWindows(env, { limit: concurrency * 4, workerId: `${workerId}:events` }),
            drainDatabaseRealtimeOutbox(env, { limit: concurrency * 8 }),
            drainNavigationRealtimeOutbox(env, { limit: concurrency * 8 }),
            drainInProductNotificationOutbox(env, { limit: concurrency * 8 }),
          ]);
        } else if (lane === "automation") {
          await drainDatabaseAutomationRuns(env, { limit: concurrency, workerId: `${workerId}:automation` });
        } else if (lane === "ai") {
          await runAiJobBatch({ env, handlers: AI_JOB_HANDLERS, limit: concurrency, workerId: `${workerId}:ai` });
        } else {
          await Promise.allSettled([
            advancePendingMailIndexes(env, concurrency),
            drainMailDatabaseSyncOutbox(env, { limit: concurrency, workerId: `${workerId}:mail` }),
          ]);
        }
        const next = await nextLaneDueAt(lane);
        if (next) scheduleLane(lane, new Date(Math.max(next.getTime(), Date.now() + 250)));
      });
    } catch (error) {
      console.warn(JSON.stringify({
        code: boundedErrorCode(error),
        event: "background.node_lane",
        lane,
        outcome: "failed",
      }));
      scheduleLane(lane, new Date(Date.now() + 5_000));
    }
  };

  const reconcile = async () => {
    if (stopping) return;
    await Promise.allSettled(LANES.map((lane) => drainLane(lane)));
    await runWithDbEnv(env, () => runDueBackgroundMaintenance({ env, workerId }));
    await recalculateLaneTimers();
  };

  const recalculateLaneTimers = () => runWithDbEnv(env, async () => {
    await Promise.all(LANES.map(async (lane) => {
      const next = await nextLaneDueAt(lane);
      if (next) scheduleLane(lane, next);
    }));
  });

  const scheduleRecovery = () => {
    if (stopping) return;
    const jitter = Math.floor(Math.random() * 10_001) - 5_000;
    recoveryTimer = setTimeout(() => {
      track(reconcile().finally(scheduleRecovery));
    }, 30_000 + jitter);
    recoveryTimer.unref();
  };

  const connectListener = async () => {
    if (stopping) return;
    const databaseUrl = getDatabaseUrl(env);
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const next = createDbClientForUrl(databaseUrl);
    try {
      await next.client.connect();
      await next.client.query(`listen ${CHANNEL}`);
      listener = next.client;
      listenerReady = true;
      reconnectAttempt = 0;
      next.client.on("notification", (message) => {
        const signal = parseSignal(message.payload);
        if (signal) scheduleLane(signal.lane, signal.availableAt);
      });
      const reconnect = () => {
        if (listener !== next.client) return;
        listener = null;
        listenerReady = false;
        void reconnectListener();
      };
      next.client.once("error", reconnect);
      next.client.once("end", reconnect);
      await recalculateLaneTimers();
    } catch (error) {
      await next.client.end().catch(() => undefined);
      throw error;
    }
  };

  const reconnectListener = async () => {
    if (stopping) return;
    const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt++);
    setTimeout(() => {
      if (stopping) return;
      void connectListener().catch((error) => {
        console.warn(JSON.stringify({
          code: boundedErrorCode(error),
          event: "background.node_listener",
          outcome: "reconnecting",
        }));
        void reconnectListener();
      });
    }, delay).unref();
  };

  return {
    async dispatch(tasks: BackgroundTaskV1[]) {
      for (const task of tasks) scheduleLane(backgroundTaskLane(task.kind), new Date(task.availableAt));
      await publishNodeBackgroundNotification(env, tasks);
    },
    readiness() {
      return { coordinatorReady: running && !stopping, listenerReady };
    },
    async start() {
      if (running) return;
      running = true;
      await connectListener().catch(() => reconnectListener());
      await reconcile();
      scheduleRecovery();
    },
    async stop() {
      stopping = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      timerDueAt.clear();
      if (recoveryTimer) clearTimeout(recoveryTimer);
      await listener?.end().catch(() => undefined);
      listener = null;
      listenerReady = false;
      await Promise.race([
        Promise.allSettled([...inFlight]),
        new Promise((resolve) => setTimeout(resolve, 30_000)),
      ]);
      running = false;
    },
  };
}

export async function publishNodeBackgroundNotification(
  env: RuntimeEnv,
  tasks: BackgroundTaskV1[],
) {
  const earliest = new Map<BackgroundLane, Date>();
  for (const task of tasks) {
    const lane = backgroundTaskLane(task.kind);
    const availableAt = new Date(task.availableAt);
    if (!earliest.has(lane) || availableAt < earliest.get(lane)!) earliest.set(lane, availableAt);
  }
  await runWithDbEnv(env, async () => {
    for (const [lane, availableAt] of earliest) {
      // Identifiers stay in PostgreSQL; NOTIFY only wakes a lane.
      await db.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify({
        availableAt: availableAt.toISOString(),
        lane,
      })})`);
    }
  });
}

function parseSignal(payload: string | undefined) {
  try {
    const value = JSON.parse(payload ?? "") as { availableAt?: unknown; lane?: unknown };
    if (!LANES.includes(value.lane as BackgroundLane) || typeof value.availableAt !== "string") return null;
    const availableAt = new Date(value.availableAt);
    return Number.isNaN(availableAt.getTime()) ? null : { availableAt, lane: value.lane as BackgroundLane };
  } catch {
    return null;
  }
}

function laneConcurrency(env: RuntimeEnv, lane: BackgroundLane) {
  const defaults = { ai: 2, automation: 4, fast: 8, mail: 2 };
  const key = `ZILOBASE_BACKGROUND_${lane.toUpperCase()}_CONCURRENCY`;
  const value = Number(env[key]);
  return Number.isInteger(value) ? Math.max(1, Math.min(value, 50)) : defaults[lane];
}

async function nextLaneDueAt(lane: BackgroundLane) {
  if (lane === "automation") {
    return (await db.select({ value: min(databaseAutomationRun.availableAt) }).from(databaseAutomationRun)
      .where(eq(databaseAutomationRun.status, "queued")))[0]?.value ?? null;
  }
  if (lane === "ai") {
    return (await db.select({ value: min(aiJob.availableAt) }).from(aiJob)
      .where(eq(aiJob.status, "queued")))[0]?.value ?? null;
  }
  if (lane === "mail") {
    return (await db.select({ value: min(mailDatabaseSyncOutbox.nextAttemptAt) }).from(mailDatabaseSyncOutbox)
      .where(inArray(mailDatabaseSyncOutbox.status, ["pending", "retry"])))[0]?.value ?? null;
  }
  const values = await Promise.all([
    db.select({ value: min(databaseAutomationEventWindow.nextAttemptAt) }).from(databaseAutomationEventWindow)
      .where(inArray(databaseAutomationEventWindow.status, ["accumulating", "ready"])),
    db.select({ value: min(databaseRealtimeOutbox.nextAttemptAt) }).from(databaseRealtimeOutbox),
    db.select({ value: min(navigationRealtimeOutbox.nextAttemptAt) }).from(navigationRealtimeOutbox),
    db.select({ value: min(inProductNotificationOutbox.nextAttemptAt) }).from(inProductNotificationOutbox)
      .where(eq(inProductNotificationOutbox.status, "pending")),
  ]);
  return values.flatMap((rows) => rows.map((row) => row.value)).filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}
