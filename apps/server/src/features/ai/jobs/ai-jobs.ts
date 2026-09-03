import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { aiJob } from "../../../infrastructure/database/schema";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";
import { recordRecoveredBackgroundLease } from "../../../infrastructure/background/telemetry";

const DEFAULT_LEASE_MS = 60_000;

export type AiJobRecord = typeof aiJob.$inferSelect;
type ClaimedAiJobRecord = AiJobRecord & { recoveredLease?: boolean };
export type AiJobHandler = (input: {
  assertLease(): Promise<void>;
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

class AiJobLeaseLostError extends Error {
  constructor() {
    super("AI job lease was lost");
    this.name = "AiJobLeaseLostError";
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
    await dispatchBackgroundTasks(input.env, [createBackgroundTask({
      availableAt: job.availableAt,
      env: input.env,
      kind: "ai.job",
      resourceId: job.id,
    })]);
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
  jobId?: string;
  limit?: number;
  leaseMs?: number;
  workerId: string;
}) {
  return db.transaction(async (tx) => {
    const clock = await tx.execute(sql<{ now: Date }>`select current_timestamp as now`);
    const now = new Date(clock.rows[0]!.now as Date | string);
    const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS));
    const jobs = await tx
      .select()
      .from(aiJob)
      .where(or(
        and(
          input.jobId ? eq(aiJob.id, input.jobId) : undefined,
          eq(aiJob.status, "queued"),
          lte(aiJob.availableAt, now),
        ),
        and(
          input.jobId ? eq(aiJob.id, input.jobId) : undefined,
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
      return { ...claimed!, recoveredLease: job.status === "running" };
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

export async function runAiJobById(input: {
  env: RuntimeEnv;
  handlers: Readonly<Record<string, AiJobHandler>>;
  jobId: string;
  workerId: string;
}) {
  const jobs = await claimAiJobs({ jobId: input.jobId, limit: 1, workerId: input.workerId });
  if (jobs[0]) return executeClaimedJob({ ...input, job: jobs[0] });
  const [job] = await db.select({
    availableAt: aiJob.availableAt,
    status: aiJob.status,
  }).from(aiJob).where(eq(aiJob.id, input.jobId)).limit(1);
  if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) {
    return { outcome: "noop" as const };
  }
  if (job.status === "queued" && job.availableAt.getTime() > Date.now()) {
    return { availableAt: job.availableAt.toISOString(), outcome: "retry" as const };
  }
  return { availableAt: new Date(Date.now() + 5_000).toISOString(), outcome: "retry" as const };
}

async function executeClaimedJob(input: {
  env: RuntimeEnv;
  handlers: Readonly<Record<string, AiJobHandler>>;
  job: ClaimedAiJobRecord;
  workerId: string;
}) {
  const handler = input.handlers[input.job.type];
  if (input.job.recoveredLease) recordRecoveredBackgroundLease(input.env, "ai.job");
  let leaseLost = false;
  let renewing = false;
  const assertLease = async () => {
    if (leaseLost || !(await renewAiJobLease(input.job.id, input.workerId))) {
      leaseLost = true;
      throw new AiJobLeaseLostError();
    }
  };
  const heartbeat = setInterval(() => {
    if (renewing || leaseLost) return;
    renewing = true;
    void renewAiJobLease(input.job.id, input.workerId).then((renewed) => {
      leaseLost ||= !renewed;
    }).catch(() => {
      leaseLost = true;
    }).finally(() => {
      renewing = false;
    });
  }, 30_000);
  try {
    if (!handler) throw new PermanentAiJobError(`Unsupported AI job type: ${input.job.type}`);
    await assertLease();
    const output = await handler({
      assertLease,
      env: input.env,
      job: input.job,
      reportProgress: async (progress) => {
        await assertLease();
        await updateAiJobProgress(input.job.id, input.workerId, progress);
      },
    });
    await assertLease();
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
    return { outcome: "completed" as const };
  } catch (error) {
    if (error instanceof AiJobLeaseLostError) {
      return { availableAt: new Date(Date.now() + 5_000).toISOString(), outcome: "retry" as const };
    }
    const permanent = error instanceof PermanentAiJobError ||
      input.job.attempt >= input.job.maxAttempts;
    const now = new Date();
    const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, input.job.attempt - 1));
    const availableAt = permanent ? input.job.availableAt : new Date(now.getTime() + retryDelayMs);
    await db.update(aiJob).set({
      availableAt,
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
    if (!permanent) {
      await dispatchBackgroundTasks(input.env, [createBackgroundTask({
        availableAt,
        env: input.env,
        kind: "ai.job",
        resourceId: input.job.id,
      })]);
      return { availableAt: availableAt.toISOString(), outcome: "retry" as const };
    }
    return { errorCode: "AI_JOB_TERMINAL", outcome: "terminal" as const };
  } finally {
    clearInterval(heartbeat);
  }
}

async function renewAiJobLease(id: string, workerId: string) {
  const [renewed] = await db.update(aiJob).set({
    leaseExpiresAt: sql`current_timestamp + (${DEFAULT_LEASE_MS} * interval '1 millisecond')`,
    updatedAt: sql`current_timestamp`,
  }).where(and(
    eq(aiJob.id, id),
    eq(aiJob.status, "running"),
    eq(aiJob.workerId, workerId),
  )).returning({ id: aiJob.id });
  return Boolean(renewed);
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
