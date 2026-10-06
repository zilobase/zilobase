import { drainDatabaseRealtimeOutbox } from "./outbox";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { RuntimeEnv } from "../../../shared/config/config";
import { resultForDueRow } from "../../../infrastructure/background/task-result";
import { db } from "../../../infrastructure/database";
import { databaseRealtimeOutbox } from "../../../infrastructure/database/schema";

export async function processDatabaseRealtimeTask(env: RuntimeEnv, resourceId: string) {
  await drainDatabaseRealtimeOutbox(env, { limit: 1, outboxId: resourceId });
  return resultForDueRow(
    async () =>
      (
        await db
          .select({ nextAttemptAt: databaseRealtimeOutbox.nextAttemptAt })
          .from(databaseRealtimeOutbox)
          .where(
            and(eq(databaseRealtimeOutbox.id, resourceId), isNull(databaseRealtimeOutbox.failedAt)),
          )
          .limit(1)
      )[0],
  );
}

export async function failDatabaseRealtimeDelivery(resourceId: string) {
  const [live] = await db
    .select()
    .from(databaseRealtimeOutbox)
    .where(eq(databaseRealtimeOutbox.id, resourceId))
    .limit(1);
  if (!live || live.failedAt) return true;
  if (live.nextAttemptAt > new Date()) return false;
  await db
    .update(databaseRealtimeOutbox)
    .set({ failedAt: new Date() })
    .where(
      and(
        eq(databaseRealtimeOutbox.id, resourceId),
        lte(databaseRealtimeOutbox.nextAttemptAt, sql`current_timestamp`),
      ),
    );
  return true;
}

export async function prepareDatabaseRealtimeReplay(resourceId: string) {
  const [row] = await db
    .select()
    .from(databaseRealtimeOutbox)
    .where(eq(databaseRealtimeOutbox.id, resourceId))
    .for("update");
  if (!row || !row.failedAt) throw new Error("REPLAY_DATABASE_DELIVERY_INELIGIBLE");
  await db
    .update(databaseRealtimeOutbox)
    .set({ failedAt: null, nextAttemptAt: new Date() })
    .where(eq(databaseRealtimeOutbox.id, resourceId));
}
