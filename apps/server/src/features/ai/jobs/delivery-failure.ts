import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  aiJob,
  aiChatUpload,
  aiMcpMaterialization,
  meeting,
} from "../../../infrastructure/database/schema";

export async function failAiJobDelivery(resourceId: string) {
  const [job] = await db.select().from(aiJob).where(eq(aiJob.id, resourceId)).limit(1);
  if (!job || !["queued", "running"].includes(job.status)) return true;
  if (job.leaseExpiresAt && job.leaseExpiresAt > new Date()) return false;
  const [failed] = await db
    .update(aiJob)
    .set({
      status: "failed",
      error: "TRANSPORT_RETRIES_EXHAUSTED",
      completedAt: new Date(),
      workerId: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiJob.id, resourceId),
        inArray(aiJob.status, ["queued", "running"]),
        or(isNull(aiJob.leaseExpiresAt), lte(aiJob.leaseExpiresAt, sql`current_timestamp`)),
      ),
    )
    .returning();
  if (!failed) return false;
  const input =
    job.input && typeof job.input === "object" ? (job.input as Record<string, unknown>) : {};
  if (job.type === "upload-extraction" && typeof input.uploadId === "string")
    await db
      .update(aiChatUpload)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(
        and(
          eq(aiChatUpload.id, input.uploadId),
          eq(aiChatUpload.workspaceId, job.workspaceId),
          inArray(aiChatUpload.status, ["pending", "processing"]),
        ),
      );
  if (job.type === "mcp-database-materialization")
    await db
      .update(aiMcpMaterialization)
      .set({
        status: "failed",
        errorCode: "TRANSPORT_RETRIES_EXHAUSTED",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiMcpMaterialization.aiJobId, job.id),
          inArray(aiMcpMaterialization.status, ["queued", "running"]),
        ),
      );
  if (job.type === "meeting-summary" && typeof input.meetingId === "string")
    await db
      .update(meeting)
      .set({ status: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(meeting.id, input.meetingId),
          eq(meeting.workspaceId, job.workspaceId),
          eq(meeting.status, "processing"),
        ),
      );
  return true;
}

export async function prepareAiJobReplay(resourceId: string) {
  const [job] = await db.select().from(aiJob).where(eq(aiJob.id, resourceId)).for("update");
  if (
    !job ||
    job.status !== "failed" ||
    job.error !== "TRANSPORT_RETRIES_EXHAUSTED" ||
    job.attempt >= job.maxAttempts
  )
    throw new Error("REPLAY_AI_JOB_INELIGIBLE");
  const input =
    job.input && typeof job.input === "object" ? (job.input as Record<string, unknown>) : {};
  if (job.type === "upload-extraction") {
    if (typeof input.uploadId !== "string") throw new Error("REPLAY_UPLOAD_UNAVAILABLE");
    const [upload] = await db
      .select()
      .from(aiChatUpload)
      .where(
        and(
          eq(aiChatUpload.id, input.uploadId),
          eq(aiChatUpload.workspaceId, job.workspaceId),
          job.userId ? eq(aiChatUpload.userId, job.userId) : sql`false`,
        ),
      )
      .for("update");
    if (!upload || upload.status === "ready" || upload.expiresAt <= new Date())
      throw new Error("REPLAY_UPLOAD_INELIGIBLE");
    await db
      .update(aiChatUpload)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(aiChatUpload.id, upload.id));
  } else if (job.type === "mcp-database-materialization") {
    const [record] = await db
      .select()
      .from(aiMcpMaterialization)
      .where(eq(aiMcpMaterialization.aiJobId, job.id))
      .for("update");
    if (!record || !["queued", "running", "failed", "partial"].includes(record.status))
      throw new Error("REPLAY_MATERIALIZATION_INELIGIBLE");
    await db
      .update(aiMcpMaterialization)
      .set({ status: "queued", errorCode: null, completedAt: null, updatedAt: new Date() })
      .where(eq(aiMcpMaterialization.id, record.id));
  } else if (job.type === "meeting-summary" && typeof input.meetingId === "string") {
    const [record] = await db
      .select()
      .from(meeting)
      .where(and(eq(meeting.id, input.meetingId), eq(meeting.workspaceId, job.workspaceId)))
      .for("update");
    if (!record || record.status === "completed") throw new Error("REPLAY_MEETING_INELIGIBLE");
    await db
      .update(meeting)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(meeting.id, record.id));
  } else if (job.type === "thread-compaction") {
    if (typeof input.threadId !== "string" || !job.userId)
      throw new Error("REPLAY_THREAD_UNAVAILABLE");
    const { aiChatThread } = await import("../../../infrastructure/database/schema");
    const [thread] = await db
      .select()
      .from(aiChatThread)
      .where(
        and(
          eq(aiChatThread.id, input.threadId),
          eq(aiChatThread.workspaceId, job.workspaceId),
          eq(aiChatThread.userId, job.userId),
          isNull(aiChatThread.deletedAt),
        ),
      )
      .limit(1);
    if (!thread) throw new Error("REPLAY_THREAD_UNAVAILABLE");
  } else throw new Error("REPLAY_AI_JOB_KIND_UNSUPPORTED");
  await db
    .update(aiJob)
    .set({
      status: "queued",
      availableAt: new Date(),
      error: null,
      completedAt: null,
      workerId: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(aiJob.id, job.id));
}
