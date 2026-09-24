import { processMailSyncTask } from "./sync/mail-sync-coordinator";
import { drainMailDatabaseSyncOutbox } from "./database-sync/mail-database-sync-worker";
import { eq } from "drizzle-orm";
import type { RuntimeEnv } from "../../shared/config/config";
import type { BackgroundTaskResult } from "../../infrastructure/background/contracts";
import { resultForDueRow } from "../../infrastructure/background/task-result";
import { db } from "../../infrastructure/database";
import { mailDatabaseSyncOutbox } from "../../infrastructure/database/schema";

export async function processMailIndexTask(
  env: RuntimeEnv,
  resourceId: string,
): Promise<BackgroundTaskResult> {
  return processMailSyncTask(env, resourceId);
}

export async function processMailDatabaseSyncTask(
  env: RuntimeEnv,
  resourceId: string,
  workerId: string,
) {
  await drainMailDatabaseSyncOutbox(env, {
    limit: 1,
    outboxId: resourceId,
    workerId,
  });
  return resultForDueRow(
    async () =>
      (
        await db
          .select({
            nextAttemptAt: mailDatabaseSyncOutbox.nextAttemptAt,
            status: mailDatabaseSyncOutbox.status,
          })
          .from(mailDatabaseSyncOutbox)
          .where(eq(mailDatabaseSyncOutbox.id, resourceId))
          .limit(1)
      )[0],
  );
}
