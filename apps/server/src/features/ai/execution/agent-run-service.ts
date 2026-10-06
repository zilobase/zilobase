import { continueAgentRunModel } from "./agent-run-model";
import { PermanentAgentRunError } from "./agent-run-errors";

import { and, asc, desc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";

import { appendRunEvent, serializeRun, serializeRunEvent } from "./agent-run-records";

import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import {
  dispatchBackgroundTasks,
  backgroundTransaction,
} from "../../../infrastructure/background/dispatch";
import { db } from "../../../infrastructure/database";
import {
  aiAgentConversationMessage,
  aiAgentPendingAction,
  aiAgentRun,
  aiAgentRunEvent,
  aiAgentToolExecution,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import { getStringEnv } from "../../../shared/config/config";

import { AgentProfileError, requireAgentProfileRole } from "../agents/agent-profile-service";

import { AGENT_RUN_LEASE_MS, maintainAgentRunLease } from "./agent-run-lease";
import { resumeAgentRunAfterApproval } from "./agent-run-checkpoint";

export async function listAgentRuns(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "user" });
  return (
    await db
      .select()
      .from(aiAgentRun)
      .where(
        and(
          eq(aiAgentRun.profileId, input.profileId),
          eq(aiAgentRun.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(desc(aiAgentRun.createdAt))
      .limit(100)
  ).map((run) => serializeRun(run));
}

export async function getAgentRunDetail(input: {
  profileId: string;
  runId: string;
  userId: string;
  workspaceId: string;
}) {
  const role = await requireAgentProfileRole({ ...input, minimum: "user" });
  const [run] = await db
    .select()
    .from(aiAgentRun)
    .where(
      and(
        eq(aiAgentRun.id, input.runId),
        eq(aiAgentRun.profileId, input.profileId),
        eq(aiAgentRun.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!run) throw new AgentProfileError("agent_run_not_found", "Agent run not found.", 404);
  const events = await db
    .select()
    .from(aiAgentRunEvent)
    .where(
      and(
        eq(aiAgentRunEvent.runId, run.id),
        role === "user" ? eq(aiAgentRunEvent.visibility, "shared") : undefined,
      ),
    )
    .orderBy(asc(aiAgentRunEvent.sequence));
  return {
    events: events.map(serializeRunEvent),
    run: serializeRun(run, role !== "user"),
  };
}

export async function cancelAgentRun(input: {
  profileId: string;
  runId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  const now = new Date();
  const [run] = await db
    .update(aiAgentRun)
    .set({
      completedAt: now,
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "cancelled",
      updatedAt: now,
    })
    .where(
      and(
        eq(aiAgentRun.id, input.runId),
        eq(aiAgentRun.profileId, input.profileId),
        eq(aiAgentRun.workspaceId, input.workspaceId),
        or(
          eq(aiAgentRun.status, "queued"),
          eq(aiAgentRun.status, "running"),
          eq(aiAgentRun.status, "waiting_approval"),
        ),
      ),
    )
    .returning();
  if (!run)
    throw new AgentProfileError(
      "agent_run_not_cancellable",
      "Agent run is no longer cancellable.",
      409,
    );
  await appendRunEvent(run.id, "cancelled", "shared", {
    actorUserId: input.userId,
  });
  return serializeRun(run);
}

export async function processAgentRun(env: RuntimeEnv, input: { runId: string; workerId: string }) {
  if (
    getStringEnv(env, "AI_CUSTOM_AGENTS_ENABLED") !== "true" ||
    getStringEnv(env, "AI_CUSTOM_AGENT_EXECUTION_DISABLED") === "true"
  ) {
    return {
      availableAt: new Date(Date.now() + 60_000).toISOString(),
      outcome: "retry" as const,
    };
  }
  const now = new Date();
  const run = await claimAgentRun(input, now);
  if (!run) return { outcome: "noop" as const };
  const lease = maintainAgentRunLease(run.id, input.workerId);
  try {
    await appendRunEvent(run.id, "started", "shared", {
      attempt: run.attempts,
    });
    const result = await continueAgentRunModel(env, run, input.workerId, lease);
    if (!result) return { outcome: "completed" as const };
    if (await hasAmbiguousAgentWrite(run.id)) {
      throw new PermanentAgentRunError(
        "A write may have completed but did not return a receipt. The run was not retried.",
        "AGENT_WRITE_OUTCOME_UNKNOWN",
      );
    }
    const [liveRun] = await db
      .select({ status: aiAgentRun.status })
      .from(aiAgentRun)
      .where(eq(aiAgentRun.id, run.id))
      .limit(1);
    if (liveRun?.status === "waiting_approval") {
      await db
        .update(aiAgentRun)
        .set({ leaseExpiresAt: null, leaseOwner: null, updatedAt: new Date() })
        .where(and(eq(aiAgentRun.id, run.id), eq(aiAgentRun.leaseOwner, input.workerId)));
      return { outcome: "completed" as const };
    }
    const completedAt = new Date();
    const [completed] = await db
      .update(aiAgentRun)
      .set({
        completedAt,
        durationMs: completedAt.getTime() - (run.startedAt ?? now).getTime(),
        inputTokens: result.usage.inputTokens,
        leaseExpiresAt: null,
        leaseOwner: null,
        output: { text: result.text },
        outputSummary: result.text.slice(0, 2_000),
        outputTokens: result.usage.outputTokens,
        status: "succeeded",
        updatedAt: completedAt,
      })
      .where(and(eq(aiAgentRun.id, run.id), eq(aiAgentRun.leaseOwner, input.workerId)))
      .returning();
    if (!completed)
      return {
        availableAt: new Date(Date.now() + 5_000).toISOString(),
        outcome: "retry" as const,
      };
    await appendRunEvent(run.id, "output", "shared", { text: result.text });
    await appendRunEvent(run.id, "completed", "shared", {
      durationMs: completed.durationMs,
    });
    await db
      .update(aiAgentConversationMessage)
      .set({
        parts: [{ status: "succeeded", text: result.text, type: "run" }],
        status: "completed",
        updatedAt: completedAt,
      })
      .where(eq(aiAgentConversationMessage.runId, run.id));
    return { outcome: "completed" as const };
  } catch (error) {
    return handleAgentRunFailure(env, run, input.workerId, error);
  } finally {
    await lease.stop();
  }
}

export async function drainAgentRuns(env: RuntimeEnv, input: { limit: number; workerId: string }) {
  const now = new Date();
  // Recover an approval committed before its request process could dispatch.
  const waiting = await db
    .select({ id: aiAgentRun.id })
    .from(aiAgentRun)
    .where(eq(aiAgentRun.status, "waiting_approval"))
    .orderBy(asc(aiAgentRun.updatedAt))
    .limit(50);
  for (const run of waiting) await resumeAgentRunAfterApproval(env, run.id);
  const candidates = await db
    .select({ id: aiAgentRun.id })
    .from(aiAgentRun)
    .where(
      or(
        and(eq(aiAgentRun.status, "queued"), lte(aiAgentRun.availableAt, now)),
        and(
          eq(aiAgentRun.status, "running"),
          or(isNull(aiAgentRun.leaseExpiresAt), lt(aiAgentRun.leaseExpiresAt, now)),
        ),
      ),
    )
    .orderBy(asc(aiAgentRun.availableAt))
    .limit(Math.max(1, Math.min(input.limit, 50)));
  await Promise.all(
    candidates.map(({ id }) =>
      processAgentRun(env, {
        runId: id,
        workerId: `${input.workerId}:${id}`,
      }),
    ),
  );
  return candidates.length;
}

export async function expireAgentRunApprovals(now = new Date()) {
  const expired = await db
    .update(aiAgentPendingAction)
    .set({
      completedAt: now,
      error: "Approval expired before it was handled.",
      status: "expired",
      updatedAt: now,
    })
    .where(
      and(
        or(
          eq(aiAgentPendingAction.status, "pending"),
          eq(aiAgentPendingAction.status, "executing"),
        ),
        lte(aiAgentPendingAction.expiresAt, now),
        sql`${aiAgentPendingAction.agentRunId} is not null`,
      ),
    )
    .returning({ runId: aiAgentPendingAction.agentRunId });
  const runIds = [...new Set(expired.flatMap(({ runId }) => (runId ? [runId] : [])))];
  for (const runId of runIds) {
    const [failed] = await db
      .update(aiAgentRun)
      .set({
        completedAt: now,
        errorCode: "AGENT_APPROVAL_EXPIRED",
        errorSummary: "A required action approval expired.",
        leaseExpiresAt: null,
        leaseOwner: null,
        status: "failed",
        updatedAt: now,
      })
      .where(and(eq(aiAgentRun.id, runId), eq(aiAgentRun.status, "waiting_approval")))
      .returning({ id: aiAgentRun.id });
    if (!failed) continue;
    await db
      .update(aiAgentConversationMessage)
      .set({
        parts: [
          {
            status: "failed",
            text: "Run stopped because a required action approval expired.",
            type: "run",
          },
        ],
        status: "failed",
        updatedAt: now,
      })
      .where(eq(aiAgentConversationMessage.runId, runId));
    await appendRunEvent(runId, "approval_expired", "shared", {});
  }
  return runIds.length;
}

async function hasAmbiguousAgentWrite(runId: string) {
  const [row] = await db
    .select({ id: aiAgentToolExecution.id })
    .from(aiAgentToolExecution)
    .where(
      and(
        eq(aiAgentToolExecution.agentRunId, runId),
        eq(aiAgentToolExecution.outcomeUnknown, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function claimAgentRun(input: { runId: string; workerId: string }, now: Date) {
  const leaseExpiresAt = new Date(now.getTime() + AGENT_RUN_LEASE_MS);
  const [run] = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(aiAgentRun)
      .where(
        and(
          eq(aiAgentRun.id, input.runId),
          or(
            and(eq(aiAgentRun.status, "queued"), lte(aiAgentRun.availableAt, now)),
            and(
              eq(aiAgentRun.status, "running"),
              or(isNull(aiAgentRun.leaseExpiresAt), lt(aiAgentRun.leaseExpiresAt, now)),
            ),
          ),
        ),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return [];
    const [claimed] = await tx
      .update(aiAgentRun)
      .set({
        attempts: candidate.attempts + 1,
        errorCode: null,
        errorSummary: null,
        leaseExpiresAt,
        leaseOwner: input.workerId,
        startedAt: candidate.startedAt ?? now,
        status: "running",
        updatedAt: now,
      })
      .where(eq(aiAgentRun.id, candidate.id))
      .returning();
    return claimed ? [claimed] : [];
  });
  return run;
}

async function handleAgentRunFailure(
  env: RuntimeEnv,
  run: typeof aiAgentRun.$inferSelect,
  workerId: string,
  error: unknown,
) {
  const [live] = await db.select().from(aiAgentRun).where(eq(aiAgentRun.id, run.id)).limit(1);
  if (live?.leaseOwner !== workerId || live.status !== "running") {
    if (live?.leaseOwner === workerId && live.status === "waiting_approval") {
      await db
        .update(aiAgentRun)
        .set({ leaseExpiresAt: null, leaseOwner: null })
        .where(and(eq(aiAgentRun.id, run.id), eq(aiAgentRun.leaseOwner, workerId)));
    }
    return { outcome: "noop" as const };
  }
  const ambiguousWrite = await hasAmbiguousAgentWrite(run.id);
  const permanent =
    ambiguousWrite || error instanceof PermanentAgentRunError || run.attempts >= run.maxAttempts;
  const failedAt = new Date();
  const availableAt = new Date(
    failedAt.getTime() + Math.min(60_000, 1_000 * 2 ** Math.max(0, run.attempts - 1)),
  );
  const code = ambiguousWrite
    ? "AGENT_WRITE_OUTCOME_UNKNOWN"
    : error instanceof PermanentAgentRunError
      ? error.code
      : "AGENT_RUN_FAILED";
  return backgroundTransaction(env, async () => {
    const [failed] = await db
      .update(aiAgentRun)
      .set({
        availableAt,
        completedAt: permanent ? failedAt : null,
        errorCode: code,
        errorSummary: (error instanceof Error ? error.message : String(error)).slice(0, 2_000),
        leaseExpiresAt: null,
        leaseOwner: null,
        status: permanent ? "failed" : "queued",
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(aiAgentRun.id, run.id),
          eq(aiAgentRun.leaseOwner, workerId),
          eq(aiAgentRun.status, "running"),
        ),
      )
      .returning({ id: aiAgentRun.id });
    if (!failed) return { outcome: "noop" as const };
    await appendRunEvent(run.id, permanent ? "failed" : "retry_scheduled", "shared", { code });
    if (permanent) {
      await db
        .update(aiAgentConversationMessage)
        .set({
          parts: [{ status: "failed", text: "Run failed.", type: "run" }],
          status: "failed",
          updatedAt: failedAt,
        })
        .where(eq(aiAgentConversationMessage.runId, run.id));
    }
    if (permanent) return { errorCode: code, outcome: "terminal" as const };
    await dispatchBackgroundTasks(env, [
      createBackgroundTask({
        availableAt,
        env,
        kind: "agent.run",
        resourceId: run.id,
      }),
    ]);
    return {
      availableAt: availableAt.toISOString(),
      errorCode: code,
      outcome: "retry" as const,
    };
  });
}
