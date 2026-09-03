import { and, asc, eq, inArray, lte } from "drizzle-orm";

import type { RuntimeEnv } from "../../shared/config/config";
import { db } from "../../infrastructure/database";
import { inProductNotificationOutbox } from "../../infrastructure/database/schema";
import { getRuntimeAdapter } from "../../infrastructure/runtime/runtime-adapter";

export async function drainInProductNotificationOutbox(
  env: RuntimeEnv,
  options: { limit?: number; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 100, 200));
  const rows = await db.select().from(inProductNotificationOutbox).where(and(
    eq(inProductNotificationOutbox.status, "pending"),
    lte(inProductNotificationOutbox.nextAttemptAt, now),
  )).orderBy(asc(inProductNotificationOutbox.createdAt)).limit(limit);
  if (!rows.length) return { published: 0, retained: 0 };
  const publish = getRuntimeAdapter().publishInProductNotification;
  let published = 0;
  const publishedIds: string[] = [];
  for (const row of rows) {
    try {
      await publish?.({
        env,
        notificationId: row.notificationId,
        userId: row.userId,
        workspaceId: row.workspaceId,
      });
      publishedIds.push(row.id);
      published += 1;
    } catch (error) {
      console.warn(JSON.stringify({
        error: error instanceof Error ? error.name : "UnknownError",
        event: "notification.publish_failed",
        notification_id: row.notificationId,
      }));
      await db.update(inProductNotificationOutbox).set({
        attempts: row.attempts + 1,
        nextAttemptAt: new Date(now.getTime() + Math.min(60_000, 1_000 * 2 ** row.attempts)),
        updatedAt: now,
      }).where(eq(inProductNotificationOutbox.id, row.id));
    }
  }
  if (publishedIds.length) await db.update(inProductNotificationOutbox).set({
    publishedAt: now,
    status: "published",
    updatedAt: now,
  }).where(inArray(inProductNotificationOutbox.id, publishedIds));
  return { published, retained: rows.length - published };
}
