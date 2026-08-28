import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";

import type { RuntimeEnv } from "../config";
import { db } from "../db";
import { aiJob } from "../db/schema";
import { getRuntimeAdapter } from "../runtime-adapter";

const DEFAULT_LEASE_MS = 60_000;

export type AiJobRecord = typeof aiJob.$inferSelect;
export type AiJobHandler = (input: {
  env: RuntimeEnv;
  job: AiJobRecord;
  reportProgress(progress: number): Promise<void>;
}) => Promise<unknown>;

export class PermanentAiJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentAiJobError";
  }
}

export async function enqueueAiJob(input: {
  dedupeKey: string;
  env?: RuntimeEnv;
  input: unknown;
  maxAttempts?: number;
  type: string;
  userId?: string | null;
  workspaceId: string;
}) {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(aiJob).values({
    availableAt: now,
    createdAt: now,
    dedupeKey: input.dedupeKey,
    id,
    input: input.input,
    maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 3, 10)),
    status: "queued",
    type: input.type,
    updatedAt: now,
    userId: input.userId ?? null,
    workspaceId: input.workspaceId,
  }).onConflictDoNothing({
    target: [aiJob.workspaceId, aiJob.type, aiJob.dedupeKey],
  });
  const [job] = await db
    .select()
    .from(aiJob)
    .where(and(
      eq(aiJob.workspaceId, input.workspaceId),
      eq(aiJob.type, input.type),
      eq(aiJob.dedupeKey, input.dedupeKey),
    ))
    .limit(1);
  if (!job) throw new Error("Unable to reserve AI job.");
  if (job.status === "queued" && input.env) {
    await getRuntimeAdapter().enqueueAiJob?.({ env: input.env, jobId: job.id });
  }
  return job;
}

export async function getOwnedAiJob(input: {
  id: string;
  userId: string;
  workspaceId: string;
}) {
  const [job] = await db
    .select()
    .from(aiJob)
    .where(and(
      eq(aiJob.id, input.id),
      eq(aiJob.workspaceId, input.workspaceId),
      eq(aiJob.userId, input.userId),
    ))
    .limit(1);
  return job ?? null;
}

export async function claimAiJobs(input: {
  limit?: number;
  leaseMs?: number;
  workerId: string;
}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS));
  return db.transaction(async (tx) => {
    const jobs = await tx
      .select()
      .from(aiJob)
      .where(or(
        and(eq(aiJob.status, "queued"), lte(aiJob.availableAt, now)),
        and(
          eq(aiJob.status, "running"),
          or(isNull(aiJob.leaseExpiresAt), lt(aiJob.leaseExpiresAt, now)),
        ),
      ))
      .orderBy(asc(aiJob.availableAt), asc(aiJob.createdAt))
      .limit(Math.max(1, Math.min(input.limit ?? 5, 25)))
      .for("update", { skipLocked: true });
    if (jobs.length === 0) return [];
    return Promise.all(jobs.map(async (job) => {
      const [claimed] = await tx
        .update(aiJob)
        .set({
          attempt: job.attempt + 1,
          error: null,
          leasedAt: now,
          leaseExpiresAt,
          status: "running",
          updatedAt: now,
          workerId: input.workerId,
        })
        .where(eq(aiJob.id, job.id))
        .returning();
      return claimed!;
    }));
  });
}

export async function runAiJobBatch(input: {
  env: RuntimeEnv;
  handlers: Readonly<Record<string, AiJobHandler>>;
  limit?: number;
  workerId: string;
}) {
  const jobs = await claimAiJobs(input);
  await Promise.all(jobs.map((job) => executeClaimedJob({ ...input, job })));
  return jobs.length;
}

async function executeClaimedJob(input: {
  env: RuntimeEnv;
  handlers: Readonly<Record<string, AiJobHandler>>;
  job: AiJobRecord;
  workerId: string;
}) {
  const handler = input.handlers[input.job.type];
  try {
    if (!handler) throw new PermanentAiJobError(`Unsupported AI job type: ${input.job.type}`);
    const output = await handler({
      env: input.env,
      job: input.job,
      reportProgress: (progress) => updateAiJobProgress(
        input.job.id,
        input.workerId,
        progress,
      ),
    });
    const now = new Date();
    await db.update(aiJob).set({
      completedAt: now,
      leaseExpiresAt: null,
      output,
      progress: 100,
      status: "succeeded",
      updatedAt: now,
      workerId: null,
    }).where(and(
      eq(aiJob.id, input.job.id),
      eq(aiJob.status, "running"),
      eq(aiJob.workerId, input.workerId),
    ));
  } catch (error) {
    const permanent = error instanceof PermanentAiJobError ||
      input.job.attempt >= input.job.maxAttempts;
    const now = new Date();
    const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, input.job.attempt - 1));
    await db.update(aiJob).set({
      availableAt: permanent ? input.job.availableAt : new Date(now.getTime() + retryDelayMs),
      completedAt: permanent ? now : null,
      error: (error instanceof Error ? error.message : String(error)).slice(0, 2_000),
      leaseExpiresAt: null,
      status: permanent ? "failed" : "queued",
      updatedAt: now,
      workerId: null,
    }).where(and(
      eq(aiJob.id, input.job.id),
      eq(aiJob.status, "running"),
      eq(aiJob.workerId, input.workerId),
    ));
  }
}

async function updateAiJobProgress(id: string, workerId: string, progress: number) {
  await db.update(aiJob).set({
    progress: Math.max(0, Math.min(Math.round(progress), 99)),
    updatedAt: new Date(),
  }).where(and(
    eq(aiJob.id, id),
    eq(aiJob.status, "running"),
    eq(aiJob.workerId, workerId),
  ));
}
