import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import {
  databaseAutomationDefinitionSchema,
  getLatestDatabaseAutomationOccurrence,
  getNextDatabaseAutomationOccurrence,
  type DatabaseAutomationSchedule,
} from "@zilobase/features/databases/automations";

import { isDatabaseAutomationExecutionEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  databaseAutomation,
  databaseAutomationRevision,
  databaseAutomationRun,
} from "../../../infrastructure/database/schema";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";

export type DatabaseAutomationScheduleClaimPlan = {
  nextRunAt: Date | null;
  occurrenceKey: string | null;
  scheduledFor: Date | null;
};

export function planDatabaseAutomationScheduleClaim(input: {
  automationId: string;
  now: Date;
  schedule: DatabaseAutomationSchedule;
}): DatabaseAutomationScheduleClaimPlan {
  const scheduledFor = getLatestDatabaseAutomationOccurrence(input.schedule, input.now);
  const nextRunAt = getNextDatabaseAutomationOccurrence(input.schedule, input.now);
  return {
    nextRunAt,
    occurrenceKey: scheduledFor
      ? `${input.automationId}:${scheduledFor.toISOString()}`
      : null,
    scheduledFor,
  };
}

export async function scanDueDatabaseAutomationSchedules(
  env: RuntimeEnv,
  options: { limit?: number; now?: Date } = {},
) {
  if (!isDatabaseAutomationExecutionEnabled(env)) return { claimed: 0, runIds: [] as string[] };
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const result = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: databaseAutomation.id })
      .from(databaseAutomation)
      .where(
        and(
          eq(databaseAutomation.status, "active"),
          isNull(databaseAutomation.deletedAt),
          lte(databaseAutomation.nextRunAt, now),
        ),
      )
      .orderBy(asc(databaseAutomation.nextRunAt), asc(databaseAutomation.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (!due.length) return { claimed: 0, runIds: [] as string[] };
    const records = await tx
      .select({ automation: databaseAutomation, revision: databaseAutomationRevision })
      .from(databaseAutomation)
      .innerJoin(
        databaseAutomationRevision,
        eq(databaseAutomation.currentRevisionId, databaseAutomationRevision.id),
      )
      .where(inArray(databaseAutomation.id, due.map(({ id }) => id)));

    const createdRunIds: string[] = [];
    for (const record of records) {
      const parsed = databaseAutomationDefinitionSchema.safeParse(record.revision.definition);
      if (!parsed.success || parsed.data.trigger.kind !== "schedule") {
        await tx
          .update(databaseAutomation)
          .set({ nextRunAt: null, updatedAt: now })
          .where(eq(databaseAutomation.id, record.automation.id));
        continue;
      }
      const plan = planDatabaseAutomationScheduleClaim({
        automationId: record.automation.id,
        now,
        schedule: parsed.data.trigger.schedule,
      });
      if (plan.scheduledFor && plan.occurrenceKey) {
        const [created] = await tx
          .insert(databaseAutomationRun)
          .values({
            automationId: record.automation.id,
            createdAt: now,
            dataSourceId: record.automation.dataSourceId,
            definitionHash: record.revision.definitionHash,
            id: crypto.randomUUID(),
            inputSnapshot: { scheduledFor: plan.scheduledFor.toISOString() },
            occurrenceKey: plan.occurrenceKey,
            revisionId: record.revision.id,
            scheduledFor: plan.scheduledFor,
            status: "queued",
            triggerTime: plan.scheduledFor,
            updatedAt: now,
            workspaceId: record.automation.workspaceId,
          })
          .onConflictDoNothing()
          .returning({ id: databaseAutomationRun.id });
        if (created) createdRunIds.push(created.id);
      }
      await tx
        .update(databaseAutomation)
        .set({ nextRunAt: plan.nextRunAt, updatedAt: now })
        .where(eq(databaseAutomation.id, record.automation.id));
    }
    return { claimed: due.length, runIds: createdRunIds };
  });

  await dispatchBackgroundTasks(env, result.runIds.map((runId) =>
    createBackgroundTask({ env, kind: "automation.run", resourceId: runId })
  ));
  return result;
}
