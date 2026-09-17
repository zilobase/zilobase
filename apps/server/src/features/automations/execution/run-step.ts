import { and, eq } from "drizzle-orm";
import { type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  databaseAutomationRun,
  databaseAutomationStepRun,
} from "../../../infrastructure/database/schema";

import {
  AutomationActionError,
  RetryableAutomationActionError,
  actionFailure,
  isAutomationLeaseLost,
} from "./action-error";
import { type ExecutionContext } from "./execution-context";
import { restoreStepOutput, toJson } from "../actions/action-values";
import { executeAction } from "./action-executor";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";

export async function executeClaimedStep(
  context: ExecutionContext,
  action: ExecutionContext["definition"]["actions"][number],
  actionIndex: number,
  execution: {
    workerId: string;
    env: RuntimeEnv;
    assertLease: () => Promise<void>;
  },
) {
  const { workerId, env, assertLease } = execution;
  const runId = context.run.id;
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
    if (isAutomationLeaseLost(error)) return "retry" as const;
    const failure = actionFailure(error, action.id);
    if (failure instanceof RetryableAutomationActionError) {
      await db.transaction(async (tx) => {
        await tx
          .update(databaseAutomationStepRun)
          .set({
            errorCode: failure.code,
            errorSummary: failure.message,
            finishedAt: null,
            status: "queued",
            updatedAt: new Date(),
          })
          .where(eq(databaseAutomationStepRun.id, step.id));
        await tx
          .update(databaseAutomationRun)
          .set({
            availableAt: failure.availableAt,
            errorCode: failure.code,
            errorSummary: failure.message,
            leaseExpiresAt: null,
            leaseOwner: null,
            status: "queued",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(databaseAutomationRun.id, runId),
              eq(databaseAutomationRun.leaseOwner, workerId),
            ),
          );
      });
      await dispatchBackgroundTasks(env, [
        createBackgroundTask({
          availableAt: failure.availableAt,
          env,
          kind: "automation.run",
          resourceId: runId,
        }),
      ]);
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
  return "completed" as const;
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
  if (!existing)
    throw new AutomationActionError("Action receipt was unavailable");
  if (existing.status === "succeeded") return existing;
  const [claimed] = await db
    .update(databaseAutomationStepRun)
    .set({
      attempts: existing.attempts + 1,
      startedAt: now,
      status: "running",
      updatedAt: now,
    })
    .where(eq(databaseAutomationStepRun.id, existing.id))
    .returning();
  return claimed!;
}
