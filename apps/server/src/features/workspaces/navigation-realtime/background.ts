import { drainNavigationRealtimeOutbox } from "./outbox";
import { eq } from "drizzle-orm";
import type { RuntimeEnv } from "../../../shared/config/config";
import { resultForDueRow } from "../../../infrastructure/background/task-result";
import { db } from "../../../infrastructure/database";
import { navigationRealtimeOutbox } from "../../../infrastructure/database/schema";

export async function processNavigationRealtimeTask(env: RuntimeEnv, resourceId: string) {
  await drainNavigationRealtimeOutbox(env, { limit: 1, outboxId: resourceId });
  return resultForDueRow(
    async () =>
      (
        await db
          .select({ nextAttemptAt: navigationRealtimeOutbox.nextAttemptAt })
          .from(navigationRealtimeOutbox)
          .where(eq(navigationRealtimeOutbox.id, resourceId))
          .limit(1)
      )[0],
  );
}
