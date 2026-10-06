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
