import { and, asc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { isDatabaseAutomationExecutionEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { database, databaseAutomation, databaseAutomationRun, databaseAutomationStepRun, dataSource } from "../../../infrastructure/database/schema";
import { requireDataSourceAccess } from "../access/data-source-access";
import { AutomationActionError, RetryableAutomationActionError, actionFailure } from "./action-error";
import { type ExecutionContext, loadExecutionContext } from "./execution-context";
import { restoreStepOutput, toJson, requireOwner } from "./action-support";
import { executeAction } from "./action-executor";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";
import { recordRecoveredBackgroundLease } from "../../../infrastructure/background/telemetry";

const RUN_LEASE_MS = 2 * 60_000;
const WORKSPACE_RUN_LIMIT = 10;

export function selectWorkspaceRunClaims(
  candidates: Array<{ id: string; workspaceId: string }>,
  running: Array<{ count: number; workspaceId: string }>,
  limit: number,
) {
  const available = new Map<string, number>();
  for (const { workspaceId } of candidates) {
    if (!available.has(workspaceId)) {
      available.set(workspaceId, WORKSPACE_RUN_LIMIT - (running.find((row) => row.workspaceId === workspaceId)?.count ?? 0));
    }
  }
  const selected: string[] = [];
  for (const row of candidates) {
    const remaining = available.get(row.workspaceId) ?? 0;
    if (remaining <= 0 || selected.length >= limit) continue;
    selected.push(row.id);
    available.set(row.workspaceId, remaining - 1);
  }
  return selected;
}

export class AutomationRunCapacityError extends Error {
  readonly code = "AUTOMATION_WORKSPACE_CAPACITY";
  constructor() {
    super("Automation workspace concurrency is currently full");
    this.name = "AutomationRunCapacityError";
  }
}

export async function drainDatabaseAutomationRuns(
  env: RuntimeEnv,
  options: { limit?: number; runId?: string; workerId?: string } = {},
) {
  if (!isDatabaseAutomationExecutionEnabled(env)) return { claimed: 0, failed: 0, succeeded: 0 };
  const workerId = options.workerId ?? `automation-runner:${crypto.randomUUID()}`;
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const claimed = await db.transaction(async (tx) => {
    const clock = await tx.execute(sql<{ now: Date }>`select current_timestamp as now`);
    const now = new Date(clock.rows[0]!.now as Date | string);
    const rows = await tx
      .select({
        id: databaseAutomationRun.id,
        status: databaseAutomationRun.status,
        workspaceId: databaseAutomationRun.workspaceId,
      })
      .from(databaseAutomationRun)
      .where(
        and(
          options.runId ? eq(databaseAutomationRun.id, options.runId) : undefined,
          or(
            and(
              eq(databaseAutomationRun.status, "queued"),
              lte(databaseAutomationRun.availableAt, now),
            ),
            and(
              eq(databaseAutomationRun.status, "running"),
              lte(databaseAutomationRun.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(databaseAutomationRun.createdAt))
      .limit(250)
      .for("update", { skipLocked: true });
    if (!rows.length) {
      return { claims: [] as Array<{ id: string; recoveredLease?: boolean }>, deferred: false };
    }
    const workspaceIds = [...new Set(rows.map(({ workspaceId }) => workspaceId))].sort();
    for (const workspaceId of workspaceIds) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`database-automation:${workspaceId}`}))`);
    }
    const running = await tx.select({
      count: sql<number>`count(*)::integer`,
      workspaceId: databaseAutomationRun.workspaceId,
    }).from(databaseAutomationRun).where(and(
      inArray(databaseAutomationRun.workspaceId, workspaceIds),
      eq(databaseAutomationRun.status, "running"),
      gt(databaseAutomationRun.leaseExpiresAt, now),
    )).groupBy(databaseAutomationRun.workspaceId);
    const selected = selectWorkspaceRunClaims(rows, running, limit);
    if (!selected.length) {
      return {
        claims: [] as Array<{ id: string; recoveredLease?: boolean }>,
        deferred: Boolean(options.runId),
      };
    }
    const claimedRows = await tx
      .update(databaseAutomationRun)
      .set({
        attempts: sql`${databaseAutomationRun.attempts} + 1`,
        leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
        leaseOwner: workerId,
        startedAt: sql`coalesce(${databaseAutomationRun.startedAt}, ${now})`,
        status: "running",
        updatedAt: now,
      })
      .where(inArray(databaseAutomationRun.id, selected))
      .returning({ id: databaseAutomationRun.id });
    const claims = claimedRows.map((claim) => ({
      ...claim,
      recoveredLease: rows.find((row) => row.id === claim.id)?.status === "running",
    }));
    return { claims, deferred: false };
  });
  if (claimed.deferred) throw new AutomationRunCapacityError();

  let failed = 0;
  let retried = 0;
  let succeeded = 0;
  for (const run of claimed.claims) {
    if (run.recoveredLease) recordRecoveredBackgroundLease(env, "automation.run");
    const result = await executeRun(run.id, workerId, env);
    if (result === "succeeded") succeeded += 1;
    else if (result === "retry") retried += 1;
    else failed += 1;
  }
  return { claimed: claimed.claims.length, failed, retried, succeeded };
}

export async function processDatabaseAutomationRun(
  env: RuntimeEnv,
  input: { runId: string; workerId: string },
) {
  if (!isDatabaseAutomationExecutionEnabled(env)) return { outcome: "noop" as const };
  try {
    const result = await drainDatabaseAutomationRuns(env, {
      limit: 1,
      runId: input.runId,
      workerId: input.workerId,
    });
    if (result.succeeded) return { outcome: "completed" as const };
    if (result.failed) return { errorCode: "AUTOMATION_RUN_FAILED", outcome: "terminal" as const };
  } catch (error) {
    if (!(error instanceof AutomationRunCapacityError)) throw error;
  }
  const [run] = await db.select({
    availableAt: databaseAutomationRun.availableAt,
    status: databaseAutomationRun.status,
  }).from(databaseAutomationRun).where(eq(databaseAutomationRun.id, input.runId)).limit(1);
  if (!run || ["succeeded", "failed", "skipped", "cancelled"].includes(run.status)) {
    return { outcome: "noop" as const };
  }
  return {
    availableAt: new Date(Math.max(run.availableAt.getTime(), Date.now() + 5_000)).toISOString(),
    outcome: "retry" as const,
  };
}

async function executeRun(runId: string, workerId: string, env: RuntimeEnv) {
  let leaseLost = false;
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing || leaseLost) return;
    renewing = true;
    void renewRunLease(runId, workerId).then((renewed) => {
      leaseLost ||= !renewed;
    }).catch(() => {
      leaseLost = true;
    }).finally(() => {
      renewing = false;
    });
  }, 30_000);
  try {
    return await executeRunWithLease(runId, workerId, env, async () => {
      if (leaseLost || !(await renewRunLease(runId, workerId))) {
        leaseLost = true;
        throw new AutomationActionError("Automation run lease was lost", "AUTOMATION_LEASE_LOST");
      }
    });
  } finally {
    clearInterval(heartbeat);
  }
}

async function executeRunWithLease(
  runId: string,
  workerId: string,
  env: RuntimeEnv,
  assertLease: () => Promise<void>,
) {
  let loaded: Awaited<ReturnType<typeof loadExecutionContext>>;
  try {
    loaded = await loadExecutionContext(runId, workerId);
  } catch (error) {
    await failClaimedRun(runId, workerId, actionFailure(error));
    return "failed" as const;
  }
  if (!loaded) return "failed" as const;
  const context: ExecutionContext = {
    ...loaded,
    actionOutputs: {},
    variables: {},
  };
  for (const step of loaded.completedSteps) {
    restoreStepOutput(context, step.actionId, step.outputSummary);
  }

  if (context.automation.status !== "active") {
    await skipClaimedRun(runId, workerId, "automation_inactive");
    return "succeeded" as const;
  }

  try {
    await requireDataSourceAccess(
      context.run.dataSourceId,
      requireOwner(context.automation.ownerUserId),
      "full",
    );
    const [source] = await db
      .select({ config: database.config })
      .from(dataSource)
      .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
      .where(eq(dataSource.id, context.run.dataSourceId))
      .limit(1);
    if (
      !source ||
      (source.config &&
        typeof source.config === "object" &&
        !Array.isArray(source.config) &&
        (source.config as { locked?: unknown }).locked === true)
    ) {
      throw new AutomationActionError("The source database is locked", "AUTOMATION_SOURCE_LOCKED");
    }

    for (const [actionIndex, action] of context.definition.actions.entries()) {
      if (context.completedSteps.some((step) => step.actionId === action.id)) continue;
      await assertLease();
      const step = await startStep(context.run.id, action.id, actionIndex);
      try {
        await assertLease();
        const output = await executeAction(context, action, env);
        await assertLease();
        await db
          .update(databaseAutomationStepRun)
          .set({
            finishedAt: new Date(),
            outputSummary: toJson(output),
            status: "succeeded",
            updatedAt: new Date(),
          })
          .where(eq(databaseAutomationStepRun.id, step.id));
        restoreStepOutput(context, action.id, output);
      } catch (error) {
        if (isLeaseLost(error)) return "retry" as const;
        const failure = actionFailure(error, action.id);
        if (failure instanceof RetryableAutomationActionError) {
          await db.transaction(async (tx) => {
            await tx.update(databaseAutomationStepRun).set({
              errorCode: failure.code,
              errorSummary: failure.message,
              finishedAt: null,
              status: "queued",
              updatedAt: new Date(),
            }).where(eq(databaseAutomationStepRun.id, step.id));
            await tx.update(databaseAutomationRun).set({
              availableAt: failure.availableAt,
              errorCode: failure.code,
              errorSummary: failure.message,
              leaseExpiresAt: null,
              leaseOwner: null,
              status: "queued",
              updatedAt: new Date(),
            }).where(and(
              eq(databaseAutomationRun.id, runId),
              eq(databaseAutomationRun.leaseOwner, workerId),
            ));
          });
          await dispatchBackgroundTasks(env, [createBackgroundTask({
            availableAt: failure.availableAt,
            env,
            kind: "automation.run",
            resourceId: runId,
          })]);
          return "retry" as const;
        }
        await db
          .update(databaseAutomationStepRun)
          .set({
            errorCode: failure.code,
            errorSummary: failure.message,
            finishedAt: new Date(),
            status: "failed",
            updatedAt: new Date(),
          })
          .where(eq(databaseAutomationStepRun.id, step.id));
        throw failure;
      }
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(databaseAutomationRun)
        .set({
          finishedAt: now,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "succeeded",
          updatedAt: now,
        })
        .where(and(eq(databaseAutomationRun.id, runId), eq(databaseAutomationRun.leaseOwner, workerId)));
      await tx
        .update(databaseAutomation)
        .set({ lastRunAt: now, lastRunStatus: "succeeded", updatedAt: now })
        .where(eq(databaseAutomation.id, context.automation.id));
    });
    return "succeeded" as const;
  } catch (error) {
    if (isLeaseLost(error)) return "retry" as const;
    if (error instanceof RetryableAutomationActionError) return "retry" as const;
    const failure = actionFailure(error);
    await failClaimedRun(runId, workerId, failure, context.automation.id);
    return "failed" as const;
  }
}

function isLeaseLost(error: unknown) {
  return error instanceof AutomationActionError && error.code === "AUTOMATION_LEASE_LOST";
}

async function renewRunLease(runId: string, workerId: string) {
  const [renewed] = await db.update(databaseAutomationRun).set({
    leaseExpiresAt: sql`current_timestamp + (${RUN_LEASE_MS} * interval '1 millisecond')`,
    updatedAt: sql`current_timestamp`,
  }).where(and(
    eq(databaseAutomationRun.id, runId),
    eq(databaseAutomationRun.status, "running"),
    eq(databaseAutomationRun.leaseOwner, workerId),
  )).returning({ id: databaseAutomationRun.id });
  return Boolean(renewed);
}

async function startStep(runId: string, actionId: string, actionIndex: number) {
  const idempotencyKey = `${runId}:${actionId}`;
  const now = new Date();
  const [created] = await db
    .insert(databaseAutomationStepRun)
    .values({
      actionId,
      actionIndex,
      attempts: 1,
      createdAt: now,
      id: crypto.randomUUID(),
      idempotencyKey,
      runId,
      startedAt: now,
      status: "running",
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(databaseAutomationStepRun)
    .where(eq(databaseAutomationStepRun.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!existing) throw new AutomationActionError("Action receipt was unavailable");
  if (existing.status === "succeeded") return existing;
  const [claimed] = await db
    .update(databaseAutomationStepRun)
    .set({ attempts: existing.attempts + 1, startedAt: now, status: "running", updatedAt: now })
    .where(eq(databaseAutomationStepRun.id, existing.id))
    .returning();
  return claimed!;
}

async function failClaimedRun(
  runId: string,
  workerId: string,
  failure: AutomationActionError,
  knownAutomationId?: string,
) {
  const automationId = knownAutomationId ?? (await db
    .select({ automationId: databaseAutomationRun.automationId })
    .from(databaseAutomationRun)
    .where(
      and(
        eq(databaseAutomationRun.id, runId),
        eq(databaseAutomationRun.leaseOwner, workerId),
      ),
    )
    .limit(1))[0]?.automationId;
  if (!automationId) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(databaseAutomationRun)
      .set({
        errorCode: failure.code,
        errorSummary: failure.message,
        finishedAt: now,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: "failed",
        updatedAt: now,
      })
      .where(
        and(
          eq(databaseAutomationRun.id, runId),
          eq(databaseAutomationRun.leaseOwner, workerId),
        ),
      );
    await tx
      .update(databaseAutomation)
      .set({
        errorActionId: failure.actionId,
        errorCode: failure.code,
        errorSummary: failure.message,
        erroredAt: now,
        lastRunAt: now,
        lastRunStatus: "failed",
        nextRunAt: null,
        status: "error",
        updatedAt: now,
      })
      .where(eq(databaseAutomation.id, automationId));
  });
}

async function skipClaimedRun(runId: string, workerId: string, skipReason: string) {
  const now = new Date();
  await db
    .update(databaseAutomationRun)
    .set({
      finishedAt: now,
      leaseExpiresAt: null,
      leaseOwner: null,
      skipReason,
      status: "skipped",
      updatedAt: now,
    })
    .where(
      and(
        eq(databaseAutomationRun.id, runId),
        eq(databaseAutomationRun.leaseOwner, workerId),
      ),
    );
}
