import { advanceMailIndex, publishMailIndexUpdate } from "./query/mail-index";
import { drainMailDatabaseSyncOutbox } from "./database-sync/mail-database-sync-worker";
import { eq } from "drizzle-orm";
import type { RuntimeEnv } from "../../shared/config/config";
import type { BackgroundTaskResult } from "../../infrastructure/background/contracts";
import { resultForDueRow } from "../../infrastructure/background/task-result";
import { db } from "../../infrastructure/database";
import {
  gmailAccount,
  mailIndexState,
  mailDatabaseSyncOutbox,
} from "../../infrastructure/database/schema";

export async function processMailIndexTask(
  env: RuntimeEnv,
  resourceId: string,
): Promise<BackgroundTaskResult> {
  const [account] = await db
    .select({ id: gmailAccount.id, status: gmailAccount.status })
    .from(gmailAccount)
    .where(eq(gmailAccount.id, resourceId))
    .limit(1);
  if (!account || account.status !== "connected") return { outcome: "noop" };
  await advanceMailIndex(env, account.id);
  await publishMailIndexUpdate(env, account.id);
  const [state] = await db
    .select({ status: mailIndexState.status })
    .from(mailIndexState)
    .where(eq(mailIndexState.gmailAccountId, account.id))
    .limit(1);
  return state?.status === "ready"
    ? { outcome: "completed" }
    : {
        availableAt: new Date(Date.now() + 5_000).toISOString(),
        outcome: "retry",
      };
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
