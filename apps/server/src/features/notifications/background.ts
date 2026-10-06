import { drainInProductNotificationOutbox } from "./outbox";
import { and, eq } from "drizzle-orm";
import type { RuntimeEnv } from "../../shared/config/config";
import { resultForDueRow } from "../../infrastructure/background/task-result";
import { db } from "../../infrastructure/database";
import { inProductNotificationOutbox } from "../../infrastructure/database/schema";

export async function processNotificationTask(env: RuntimeEnv, resourceId: string) {
  await drainInProductNotificationOutbox(env, {
    limit: 1,
    outboxId: resourceId,
  });
  return resultForDueRow(
    async () =>
      (
        await db
          .select({
            nextAttemptAt: inProductNotificationOutbox.nextAttemptAt,
            status: inProductNotificationOutbox.status,
          })
          .from(inProductNotificationOutbox)
          .where(eq(inProductNotificationOutbox.id, resourceId))
          .limit(1)
      )[0],
  );
}

export async function failNotificationDelivery(resourceId: string) {
  await db
    .update(inProductNotificationOutbox)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(inProductNotificationOutbox.id, resourceId),
        eq(inProductNotificationOutbox.status, "pending"),
      ),
    );
  return true;
}

export async function prepareNotificationReplay(resourceId: string) {
  const [row] = await db
    .select()
    .from(inProductNotificationOutbox)
    .where(eq(inProductNotificationOutbox.id, resourceId))
    .for("update");
  if (!row || row.status !== "failed") throw new Error("REPLAY_NOTIFICATION_INELIGIBLE");
  await db
    .update(inProductNotificationOutbox)
    .set({ status: "pending", nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(inProductNotificationOutbox.id, resourceId));
}
