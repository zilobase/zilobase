import { runWithIndependentDbEnv } from "../../infrastructure/database";
import { createBackgroundDeliveryStore } from "../../infrastructure/background/publication";
import {
  getBackgroundCellId,
  type BackgroundLane,
} from "../../infrastructure/background/contracts";
import { decodeBackgroundTaskV2 } from "../../infrastructure/background/task-v2";
import { processBackgroundTask } from "./processor";
import { runBackgroundDelivery } from "./delivery";
import type { RuntimeEnv } from "../../shared/config/config";

/** Both runtime composition roots enter through this durable delivery boundary. */
export async function deliverBackgroundTask(
  env: RuntimeEnv,
  body: unknown,
  lane: BackgroundLane,
  workerId: string,
) {
  const store = createBackgroundDeliveryStore(env, workerId);
  return runBackgroundDelivery({
    body,
    lane,
    cellId: getBackgroundCellId(env),
    store,
    execute: async (task) => {
      let renewal: Promise<unknown> | undefined;
      let lost = false;
      const heartbeat = setInterval(() => {
        if (renewal) return;
        renewal = runWithIndependentDbEnv(env, () => store.renew(task))
          .catch(() => {
            lost = true;
          })
          .finally(() => {
            renewal = undefined;
          });
      }, 30_000);
      try {
        const result = await processBackgroundTask({ env, task, workerId });
        await renewal;
        if (lost) throw new Error("BACKGROUND_DELIVERY_LEASE_LOST");
        return result;
      } finally {
        clearInterval(heartbeat);
      }
    },
  });
}

export async function recordBackgroundExhaustion(
  env: RuntimeEnv,
  body: unknown,
  lane: BackgroundLane,
) {
  const task = decodeBackgroundTaskV2(body, getBackgroundCellId(env));
  const { backgroundTaskLane } = await import("../../infrastructure/background/contracts");
  if (backgroundTaskLane(task.kind) !== lane) throw new Error("BACKGROUND_TASK_LANE_MISMATCH");
  const { db } = await import("../../infrastructure/database");
  const { backgroundDispatch } = await import("../../infrastructure/database/schema");
  const { and, eq, inArray, isNull, lte, or, sql } = await import("drizzle-orm");
  await db
    .update(backgroundDispatch)
    .set({
      status: "exhausted",
      errorCode: "TRANSPORT_RETRIES_EXHAUSTED",
      completedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(backgroundDispatch.id, task.taskId),
        eq(backgroundDispatch.cellId, task.cellId),
        inArray(backgroundDispatch.status, ["pending", "published", "running"]),
        or(
          isNull(backgroundDispatch.leaseExpiresAt),
          lte(backgroundDispatch.leaseExpiresAt, sql`current_timestamp`),
        ),
      ),
    );
}
