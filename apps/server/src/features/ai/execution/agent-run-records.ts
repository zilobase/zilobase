import { eq, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { aiAgentRun, aiAgentRunEvent } from "../../../infrastructure/database/schema";

export async function appendRunEvent(
  runId: string,
  type: string,
  visibility: "shared" | "editor",
  payload: Record<string, unknown>,
) {
  return db.transaction(async (tx) => {
    // All writers lock the parent before allocating the next sequence. A
    // transaction alone does not serialize concurrent max(sequence) reads.
    await tx
      .select({ id: aiAgentRun.id })
      .from(aiAgentRun)
      .where(eq(aiAgentRun.id, runId))
      .for("update");
    const [next] = await tx
      .select({ sequence: sql<number>`coalesce(max(${aiAgentRunEvent.sequence}), 0) + 1` })
      .from(aiAgentRunEvent)
      .where(eq(aiAgentRunEvent.runId, runId));
    await tx.insert(aiAgentRunEvent).values({
      createdAt: new Date(),
      id: crypto.randomUUID(),
      payload,
      runId,
      sequence: Number(next?.sequence ?? 1),
      type,
      visibility,
    });
  });
}

export function serializeRun(row: typeof aiAgentRun.$inferSelect, includeDiagnostics = false) {
  return {
    agentId: row.profileId,
    attempts: row.attempts,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    durationMs: row.durationMs,
    errorCode: row.errorCode,
    errorSummary: includeDiagnostics
      ? row.errorSummary
      : row.errorCode
        ? "Run could not complete."
        : null,
    id: row.id,
    initiatedByUserId: row.initiatedByUserId,
    outputSummary: row.outputSummary,
    revisionId: row.revisionId,
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status,
    triggerId: row.triggerId,
    triggerKind: row.triggerKind,
  };
}

export function serializeRunEvent(row: typeof aiAgentRunEvent.$inferSelect) {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    payload: row.payload as Record<string, unknown>,
    runId: row.runId,
    sequence: row.sequence,
    type: row.type,
    visibility: row.visibility,
  };
}
