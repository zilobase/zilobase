import { and, asc, count, eq, inArray } from "drizzle-orm";
import { databaseAutomationDefinitionSchema } from "@zilobase/features/databases/automations";

import { db } from "../../../infrastructure/database";
import {
  databaseAutomation,
  databaseAutomationDependency,
  databaseAutomationRevision,
  databaseAutomationRun,
} from "../../../infrastructure/database/schema";
import { requireManagementContext } from "./service-support";

export async function exportDatabaseAutomationAudit(input: {
  databaseId: string;
  dataSourceId: string;
  userId: string;
}) {
  await requireManagementContext(input);
  const records = await db.select({ automation: databaseAutomation, revision: databaseAutomationRevision })
    .from(databaseAutomation)
    .innerJoin(databaseAutomationRevision, eq(databaseAutomation.currentRevisionId, databaseAutomationRevision.id))
    .where(eq(databaseAutomation.dataSourceId, input.dataSourceId))
    .orderBy(asc(databaseAutomation.createdAt), asc(databaseAutomation.id));
  const revisionIds = records.map(({ revision }) => revision.id);
  const automationIds = records.map(({ automation }) => automation.id);
  const [dependencies, runs] = await Promise.all([
    revisionIds.length ? db.select({
      count: count(),
      dependencyType: databaseAutomationDependency.dependencyType,
      revisionId: databaseAutomationDependency.revisionId,
    }).from(databaseAutomationDependency).where(inArray(databaseAutomationDependency.revisionId, revisionIds))
      .groupBy(databaseAutomationDependency.revisionId, databaseAutomationDependency.dependencyType) : [],
    automationIds.length ? db.select({
      automationId: databaseAutomationRun.automationId,
      count: count(),
      status: databaseAutomationRun.status,
    }).from(databaseAutomationRun).where(inArray(databaseAutomationRun.automationId, automationIds))
      .groupBy(databaseAutomationRun.automationId, databaseAutomationRun.status) : [],
  ]);
  return {
    automations: records.map(({ automation, revision }) => {
      const parsed = databaseAutomationDefinitionSchema.safeParse(revision.definition);
      return {
        actionTypes: parsed.success ? parsed.data.actions.map(({ type }) => type) : [],
        createdAt: automation.createdAt.toISOString(),
        deletedAt: automation.deletedAt?.toISOString() ?? null,
        definitionHash: revision.definitionHash,
        dependencyCounts: Object.fromEntries(dependencies.filter((row) => row.revisionId === revision.id).map((row) => [row.dependencyType, Number(row.count)])),
        id: automation.id,
        name: automation.name,
        ownerPresent: automation.ownerUserId !== null,
        runCounts: Object.fromEntries(runs.filter((row) => row.automationId === automation.id).map((row) => [row.status, Number(row.count)])),
        status: automation.status,
        updatedAt: automation.updatedAt.toISOString(),
        version: revision.version,
      };
    }),
    dataSourceId: input.dataSourceId,
    generatedAt: new Date().toISOString(),
  };
}
