import { and, eq } from "drizzle-orm";
import { type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  database,
  databaseAutomation,
  databaseAutomationRun,
  dataSource,
} from "../../../infrastructure/database/schema";
import { requireDataSourceAccess } from "../../databases/access/data-source-access";
import {
  AutomationActionError,
  RetryableAutomationActionError,
  actionFailure,
  isAutomationLeaseLost,
} from "./action-error";
import {
  type ExecutionContext,
  loadExecutionContext,
} from "./execution-context";
import { restoreStepOutput, requireOwner } from "../actions/action-values";

import { renewRunLease } from "./run-claims";
import { executeClaimedStep } from "./run-step";

export async function executeClaimedRun(
  runId: string,
  workerId: string,
  env: RuntimeEnv,
) {
  let leaseLost = false;
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing || leaseLost) return;
    renewing = true;
    void renewRunLease(runId, workerId)
      .then((renewed) => {
        leaseLost ||= !renewed;
      })
      .catch(() => {
        leaseLost = true;
      })
      .finally(() => {
        renewing = false;
      });
  }, 30_000);
  try {
    return await executeRunWithLease(runId, workerId, env, async () => {
      if (leaseLost || !(await renewRunLease(runId, workerId))) {
        leaseLost = true;
        throw new AutomationActionError(
          "Automation run lease was lost",
          "AUTOMATION_LEASE_LOST",
        );
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
      throw new AutomationActionError(
        "The source database is locked",
        "AUTOMATION_SOURCE_LOCKED",
      );
    }

    for (const [actionIndex, action] of context.definition.actions.entries()) {
      if (context.completedSteps.some((step) => step.actionId === action.id))
        continue;
      const outcome = await executeClaimedStep(context, action, actionIndex, {
        workerId,
        env,
        assertLease,
      });
      if (outcome === "retry") return "retry" as const;
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
        .where(
          and(
            eq(databaseAutomationRun.id, runId),
            eq(databaseAutomationRun.leaseOwner, workerId),
          ),
        );
      await tx
        .update(databaseAutomation)
        .set({ lastRunAt: now, lastRunStatus: "succeeded", updatedAt: now })
        .where(eq(databaseAutomation.id, context.automation.id));
    });
    return "succeeded" as const;
  } catch (error) {
    if (isAutomationLeaseLost(error)) return "retry" as const;
    if (error instanceof RetryableAutomationActionError)
      return "retry" as const;
    const failure = actionFailure(error);
    await failClaimedRun(runId, workerId, failure, context.automation.id);
    return "failed" as const;
  }
}

async function failClaimedRun(
  runId: string,
  workerId: string,
  failure: AutomationActionError,
  knownAutomationId?: string,
) {
  const automationId =
    knownAutomationId ??
    (
      await db
        .select({ automationId: databaseAutomationRun.automationId })
        .from(databaseAutomationRun)
        .where(
          and(
            eq(databaseAutomationRun.id, runId),
            eq(databaseAutomationRun.leaseOwner, workerId),
          ),
        )
        .limit(1)
    )[0]?.automationId;
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

async function skipClaimedRun(
  runId: string,
  workerId: string,
  skipReason: string,
) {
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
