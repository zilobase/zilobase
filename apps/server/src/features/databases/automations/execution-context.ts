import { and, asc, eq, isNull } from "drizzle-orm";
import { databaseAutomationDefinitionSchema } from "@zilobase/features/databases/automations";
import { type FormulaValue } from "@zilobase/features/databases/formula";
import { db } from "../../../infrastructure/database";
import { databaseAutomation, databaseAutomationRevision, databaseAutomationRun, databaseAutomationStepRun, databaseProperty, databaseRow, page, pageProperty, pagePropertyValue } from "../../../infrastructure/database/schema";
import { AutomationActionError } from "./action-error";
export type ExecutionContext = Awaited<ReturnType<typeof loadExecutionContext>> & {
  actionOutputs: Record<string, Record<string, unknown>>;
  variables: Record<string, FormulaValue>;
};


export async function loadExecutionContext(runId: string, workerId: string) {
  const [record] = await db
    .select({ automation: databaseAutomation, revision: databaseAutomationRevision, run: databaseAutomationRun })
    .from(databaseAutomationRun)
    .innerJoin(databaseAutomation, eq(databaseAutomation.id, databaseAutomationRun.automationId))
    .innerJoin(databaseAutomationRevision, eq(databaseAutomationRevision.id, databaseAutomationRun.revisionId))
    .where(
      and(
        eq(databaseAutomationRun.id, runId),
        eq(databaseAutomationRun.status, "running"),
        eq(databaseAutomationRun.leaseOwner, workerId),
      ),
    )
    .limit(1);
  if (!record) return null;
  const parsed = databaseAutomationDefinitionSchema.safeParse(record.revision.definition);
  if (!parsed.success) throw new AutomationActionError("Pinned automation revision is invalid", "AUTOMATION_REVISION_INVALID");
  const scheduled = parsed.data.trigger.kind === "schedule";
  if (scheduled && !record.run.scheduledFor) {
    throw new AutomationActionError("Scheduled run has no occurrence", "AUTOMATION_SCHEDULE_MISSING");
  }
  if (!scheduled && (!record.run.triggerRowId || !record.run.triggerPageId)) {
    throw new AutomationActionError("Event run has no trigger page", "AUTOMATION_TRIGGER_MISSING");
  }
  const [properties, completedSteps] = await Promise.all([
    loadProperties(record.run.dataSourceId),
    db
      .select()
      .from(databaseAutomationStepRun)
      .where(
        and(
          eq(databaseAutomationStepRun.runId, runId),
          eq(databaseAutomationStepRun.status, "succeeded"),
        ),
      )
      .orderBy(asc(databaseAutomationStepRun.actionIndex)),
  ]);
  const row = scheduled ? null : await db
      .select({
        createdAt: databaseRow.createdAt,
        createdById: databaseRow.createdById,
        id: databaseRow.id,
        lastEditedById: databaseRow.lastEditedById,
        pageCreatedAt: page.createdAt,
        pageId: databaseRow.pageId,
        pageUpdatedAt: page.updatedAt,
        title: page.name,
        updatedAt: databaseRow.updatedAt,
      })
      .from(databaseRow)
      .innerJoin(page, eq(page.id, databaseRow.pageId))
      .where(
        and(
          eq(databaseRow.id, record.run.triggerRowId!),
          eq(databaseRow.dataSourceId, record.run.dataSourceId),
          isNull(databaseRow.deletedAt),
          isNull(page.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  const values = !row ? [] : await db
      .select({ propertyId: pagePropertyValue.propertyId, value: pagePropertyValue.value })
      .from(pagePropertyValue)
      .where(eq(pagePropertyValue.pageId, row.pageId));
  if (!scheduled && !row) throw new AutomationActionError("Trigger page is unavailable", "AUTOMATION_TRIGGER_MISSING");
  return {
    automation: record.automation,
    completedSteps,
    definition: parsed.data,
    properties,
    propertyValues: Object.fromEntries(values.map((value) => [value.propertyId, value.value])),
    row,
    run: record.run,
  };
}


export async function loadProperties(dataSourceId: string) {
  return db
    .select({
      property: {
        config: pageProperty.config,
        id: pageProperty.id,
        name: pageProperty.name,
        type: pageProperty.type,
      },
    })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
    .where(and(eq(databaseProperty.dataSourceId, dataSourceId), isNull(pageProperty.deletedAt)));
}
