import { drainDatabaseRealtimeOutbox } from "./outbox";
import { eq } from "drizzle-orm";
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
          .where(eq(databaseRealtimeOutbox.id, resourceId))
          .limit(1)
      )[0],
  );
}
