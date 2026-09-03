import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { databaseAutomation, databaseAutomationRevision } from "../../../infrastructure/database/schema";
import { requireManagementContext, assertProtectedDefinitionOwner, getAutomationWithRevision, toSummary, toDetail, notFound } from "./service-support";

export async function listDatabaseAutomations(input: {
  databaseId: string;
  dataSourceId: string;
  userId: string;
}) {
  await requireManagementContext(input);
  const records = await db
    .select({ automation: databaseAutomation, revision: databaseAutomationRevision })
    .from(databaseAutomation)
    .innerJoin(
      databaseAutomationRevision,
      eq(databaseAutomation.currentRevisionId, databaseAutomationRevision.id),
    )
    .where(
      and(
        eq(databaseAutomation.dataSourceId, input.dataSourceId),
        isNull(databaseAutomation.deletedAt),
      ),
    )
    .orderBy(desc(databaseAutomation.updatedAt), asc(databaseAutomation.id));

  return { automations: records.map(({ automation, revision }) => toSummary(automation, revision)) };
}

export async function getDatabaseAutomation(input: {
  automationId: string;
  databaseId: string;
  userId: string;
}) {
  const record = await getAutomationWithRevision(input.automationId);
  if (!record || record.automation.deletedAt) throw notFound();
  await requireManagementContext({
    databaseId: input.databaseId,
    dataSourceId: record.automation.dataSourceId,
    userId: input.userId,
  });
  assertProtectedDefinitionOwner(record.automation, record.revision, input.userId);
  return toDetail(record.automation, record.revision);
}
