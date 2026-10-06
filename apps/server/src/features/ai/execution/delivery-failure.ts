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

export async function prepareAgentReplay(resourceId: string) {
  const [run] = await db
    .select()
    .from(aiAgentRun)
    .where(eq(aiAgentRun.id, resourceId))
    .for("update");
  if (
    !run ||
    run.status !== "failed" ||
    run.errorCode !== "TRANSPORT_RETRIES_EXHAUSTED" ||
    run.attempts >= run.maxAttempts
  )
    throw new Error("REPLAY_AGENT_INELIGIBLE");
  const [uncertain] = await db
    .select()
    .from(aiAgentToolExecution)
    .where(
      and(
        eq(aiAgentToolExecution.agentRunId, resourceId),
        or(
          eq(aiAgentToolExecution.outcomeUnknown, true),
          eq(aiAgentToolExecution.status, "running"),
        ),
      ),
    )
    .limit(1);
  if (uncertain) throw new Error("REPLAY_UNCERTAIN_WRITE_REQUIRES_REVIEW");
  const { aiAgentProfile, aiAgentPendingAction } =
    await import("../../../infrastructure/database/schema");
  const [profile] = await db
    .select()
    .from(aiAgentProfile)
    .where(
      and(
        eq(aiAgentProfile.id, run.profileId),
        eq(aiAgentProfile.workspaceId, run.workspaceId),
        eq(aiAgentProfile.status, "active"),
      ),
    )
    .limit(1);
  const [approval] = await db
    .select()
    .from(aiAgentPendingAction)
    .where(
      and(
        eq(aiAgentPendingAction.agentRunId, resourceId),
        inArray(aiAgentPendingAction.status, ["pending", "executing"]),
      ),
    )
    .limit(1);
  if (!profile || approval) throw new Error("REPLAY_AGENT_AUTHORIZATION_OR_APPROVAL_REQUIRED");
  await db
    .update(aiAgentRun)
    .set({
      status: "queued",
      availableAt: new Date(),
      completedAt: null,
      errorCode: null,
      errorSummary: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(aiAgentRun.id, resourceId));
}
