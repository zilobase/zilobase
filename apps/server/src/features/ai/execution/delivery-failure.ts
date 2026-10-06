import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  aiAgentRun,
  aiAgentConversationMessage,
  aiAgentToolExecution,
} from "../../../infrastructure/database/schema";

export async function failAgentDelivery(resourceId: string) {
  const [run] = await db.select().from(aiAgentRun).where(eq(aiAgentRun.id, resourceId)).limit(1);
  if (!run || !["queued", "running"].includes(run.status)) return true;
  if (run.leaseExpiresAt && run.leaseExpiresAt > new Date()) return false;
  const [uncertain] = await db
    .select()
    .from(aiAgentToolExecution)
    .where(
      and(
        eq(aiAgentToolExecution.agentRunId, resourceId),
        eq(aiAgentToolExecution.outcomeUnknown, true),
      ),
    )
    .limit(1);
  const code = uncertain ? "AGENT_WRITE_OUTCOME_UNKNOWN" : "TRANSPORT_RETRIES_EXHAUSTED";
  const [failed] = await db
    .update(aiAgentRun)
    .set({
      status: "failed",
      errorCode: code,
      errorSummary: "Background delivery exhausted; explicit operator review is required.",
      completedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiAgentRun.id, resourceId),
        inArray(aiAgentRun.status, ["queued", "running"]),
        or(
          isNull(aiAgentRun.leaseExpiresAt),
          lte(aiAgentRun.leaseExpiresAt, sql`current_timestamp`),
        ),
      ),
    )
    .returning();
  if (!failed) return false;
  await db
    .update(aiAgentConversationMessage)
    .set({
      status: "failed",
      parts: [{ type: "run", status: "failed", text: "Background delivery failed." }],
      updatedAt: new Date(),
    })
    .where(eq(aiAgentConversationMessage.runId, resourceId));
  return true;
}
