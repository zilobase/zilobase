import { and, desc, eq } from "drizzle-orm";
import type {
  DatabaseAutomationRun,
  DatabaseAutomationStepRun,
} from "@zilobase/features/databases/automations";

import { db } from "../../../infrastructure/database";
import {
  databaseAutomationRun,
  databaseAutomationStepRun,
} from "../../../infrastructure/database/schema";
import { getDatabaseAutomation } from "./service";
import { DatabaseAutomationError } from "./service";

export async function listDatabaseAutomationRuns(input: {
  automationId: string;
  databaseId: string;
  limit?: number;
  userId: string;
}) {
  await getDatabaseAutomation(input);
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const runs = await db
    .select()
    .from(databaseAutomationRun)
    .where(eq(databaseAutomationRun.automationId, input.automationId))
    .orderBy(desc(databaseAutomationRun.createdAt))
    .limit(limit);
  return { runs: runs.map((run) => toRun(run)) };
}

export async function getDatabaseAutomationRun(input: {
  automationId: string;
  databaseId: string;
  runId: string;
  userId: string;
}) {
  await getDatabaseAutomation(input);
  const [run] = await db
    .select()
    .from(databaseAutomationRun)
    .where(
      and(
        eq(databaseAutomationRun.id, input.runId),
        eq(databaseAutomationRun.automationId, input.automationId),
      ),
    )
    .limit(1);
  if (!run) {
    throw new DatabaseAutomationError(
      "Automation run not found",
      404,
      "AUTOMATION_RUN_NOT_FOUND",
    );
  }
  const steps = await db
    .select()
    .from(databaseAutomationStepRun)
    .where(eq(databaseAutomationStepRun.runId, run.id))
    .orderBy(databaseAutomationStepRun.actionIndex);
  return toRun(run, steps.map(toStep));
}

function toRun(
  run: typeof databaseAutomationRun.$inferSelect,
  steps?: DatabaseAutomationStepRun[],
): DatabaseAutomationRun {
  return {
    automationId: run.automationId,
    durationMs: duration(run.startedAt, run.finishedAt),
    errorCode: run.errorCode,
    errorSummary: run.errorSummary,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    id: run.id,
    revisionId: run.revisionId,
    scheduledFor: run.scheduledFor?.toISOString() ?? null,
    skipReason: run.skipReason,
    startedAt: run.startedAt?.toISOString() ?? null,
    status: run.status as DatabaseAutomationRun["status"],
    ...(steps ? { steps } : {}),
    triggerActorId: run.triggerActorId,
    triggerPageId: run.triggerPageId,
    triggerRowId: run.triggerRowId,
    triggerTime: run.triggerTime.toISOString(),
  };
}

function toStep(
  step: typeof databaseAutomationStepRun.$inferSelect,
): DatabaseAutomationStepRun {
  return {
    actionId: step.actionId,
    actionIndex: step.actionIndex,
    durationMs: duration(step.startedAt, step.finishedAt),
    errorCode: step.errorCode,
    errorSummary: step.errorSummary,
    finishedAt: step.finishedAt?.toISOString() ?? null,
    id: step.id,
    inputSummary: (step.inputSummary ?? null) as DatabaseAutomationStepRun["inputSummary"],
    outputSummary: (step.outputSummary ?? null) as DatabaseAutomationStepRun["outputSummary"],
    startedAt: step.startedAt?.toISOString() ?? null,
    status: step.status as DatabaseAutomationStepRun["status"],
  };
}

const duration = (start: Date | null, end: Date | null) =>
  start && end ? Math.max(0, end.getTime() - start.getTime()) : null;
