import { and, eq, lte } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { calendarBinding, calendarNotificationOutbox } from "../../../infrastructure/database/schema";
import { publishCalendarNotification } from "@zilobase/runtime-adapter/capabilities";
import { isCalendarFeatureEnabled, type RuntimeEnv } from "../../../shared/config/config";
export async function drainCalendarOutbox(env: RuntimeEnv) {
  if (!isCalendarFeatureEnabled(env)) return;
  const rows = await db.select().from(calendarNotificationOutbox).where(lte(calendarNotificationOutbox.nextAttemptAt, new Date())).orderBy(calendarNotificationOutbox.nextAttemptAt).limit(100);
  for (const row of rows) {
    const [claimed] = await db.update(calendarNotificationOutbox).set({ nextAttemptAt: new Date(Date.now() + 60_000), attempts: row.attempts + 1 }).where(and(eq(calendarNotificationOutbox.id, row.id), eq(calendarNotificationOutbox.attempts, row.attempts))).returning();
    if (!claimed) continue;
    try {
      const bindings = await db.select().from(calendarBinding).where(eq(calendarBinding.accountId, row.accountId));
      for (const binding of bindings) if (isCalendarFeatureEnabled(env, binding.workspaceId)) await publishCalendarNotification(env, { bindingId: binding.id, userId: binding.userId, workspaceId: binding.workspaceId, accountId: row.accountId, calendarId: row.calendarId, revision: row.revision, generation: row.generation });
      await db.delete(calendarNotificationOutbox).where(eq(calendarNotificationOutbox.id, row.id));
    } catch { await db.update(calendarNotificationOutbox).set({ nextAttemptAt: new Date(Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(row.attempts, 9))) }).where(eq(calendarNotificationOutbox.id, row.id)) }
  }
}
