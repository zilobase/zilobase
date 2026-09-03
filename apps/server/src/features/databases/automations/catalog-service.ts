import { and, eq, inArray, isNull } from "drizzle-orm";
import { type DatabaseAutomationDependency } from "@zilobase/features/databases/automations";
import { db, type Database } from "../../../infrastructure/database";
import { databaseAutomation, databaseAutomationDependency, databaseAutomationRevision } from "../../../infrastructure/database/schema";
import { operatorsForPropertyType } from "./compiler";
import { DatabaseAutomationError, hasOptionReference, requireManagementContext, loadProperties, loadAutomationTargetCatalog, loadOwnedGmailConnections, loadOwnedSlackConnections, loadViews, loadWorkspaceUsers } from "./service-support";

export async function getDatabaseAutomationCatalog(input: {
  databaseId: string;
  dataSourceId: string;
  gmailEnabled?: boolean;
  slackEnabled?: boolean;
  webhooksEnabled?: boolean;
  userId: string;
}) {
  try {
    const management = await requireManagementContext(input);
    const [properties, views, users, gmailConnections, slackConnections, dataSources] = await Promise.all([
      loadProperties([input.dataSourceId]),
      loadViews(input.databaseId, input.dataSourceId),
      loadWorkspaceUsers(management.source.workspaceId),
      input.gmailEnabled === false
        ? Promise.resolve([])
        : loadOwnedGmailConnections(management.source.workspaceId, input.userId),
      input.slackEnabled === false
        ? Promise.resolve([])
        : loadOwnedSlackConnections(management.source.workspaceId, input.userId),
      loadAutomationTargetCatalog(management.source.workspaceId, input.userId),
    ]);
    return {
      actions: [
        { available: true, reason: null, type: "define_variables" as const },
        { available: true, reason: null, type: "edit_trigger_page" as const },
        { available: true, reason: null, type: "add_page" as const },
        { available: true, reason: null, type: "edit_pages" as const },
        { available: true, reason: null, type: "send_notification" as const },
        {
          available: gmailConnections.some((connection) => connection.status === "connected"),
          reason: gmailConnections.some((connection) => connection.status === "connected")
            ? null
            : gmailConnections.length
              ? "Reconnect Gmail to use this action"
              : "Connect Gmail to use this action",
          type: "send_gmail" as const,
        },
        { available: input.webhooksEnabled !== false, reason: input.webhooksEnabled === false ? "Webhooks are disabled by the server administrator" : null, type: "send_webhook" as const },
        {
          available: input.slackEnabled !== false && slackConnections.some((connection) => connection.status === "connected"),
          reason: input.slackEnabled === false
            ? "Slack is disabled by the server administrator"
            : slackConnections.some((connection) => connection.status === "connected")
            ? null
            : slackConnections.length ? "Reconnect Slack to use this action" : "Connect Slack to use this action",
          type: "send_slack" as const,
        },
      ],
      canManage: true,
      dataSourceId: management.source.id,
      dataSources,
      gmailConnections,
      slackConnections,
      manageUnavailableReason: null,
      properties: [...(properties.get(input.dataSourceId)?.values() ?? [])].map((property) => ({
        id: property.id,
        ...(property.icon ? { icon: property.icon } : {}),
        name: property.name,
        options: property.options ?? [],
        operators: [...operatorsForPropertyType(property.type)],
        ...(property.relatedDataSourceId ? { relatedDataSourceId: property.relatedDataSourceId } : {}),
        type: property.type,
        writable: property.writable,
      })),
      users,
      views: [...views.values()].map(({ id, name, type }) => ({ id, name, type })),
    };
  } catch (error) {
    if (!(error instanceof DatabaseAutomationError) || error.status !== 403) throw error;
    return {
      actions: [],
      canManage: false,
      dataSourceId: input.dataSourceId,
      dataSources: [],
      gmailConnections: [],
      slackConnections: [],
      manageUnavailableReason: error.message,
      properties: [],
      users: [],
      views: [],
    };
  }
}

export async function invalidateDatabaseAutomationDependencies(input: {
  dependencyId: string;
  dependencyType: DatabaseAutomationDependency["dependencyType"];
  reason: string;
  executor?: Database;
  workspaceId?: string;
}) {
  const executor = input.executor ?? db;
  const rows = await executor
    .select({ automationId: databaseAutomationDependency.automationId })
    .from(databaseAutomationDependency)
    .innerJoin(
      databaseAutomation,
      and(
        eq(databaseAutomation.id, databaseAutomationDependency.automationId),
        eq(databaseAutomation.currentRevisionId, databaseAutomationDependency.revisionId),
      ),
    )
    .where(
      and(
        eq(databaseAutomationDependency.dependencyType, input.dependencyType),
        eq(databaseAutomationDependency.dependencyId, input.dependencyId),
        input.workspaceId ? eq(databaseAutomation.workspaceId, input.workspaceId) : undefined,
      ),
    );
  const legacyOptionRows = input.dependencyType === "option"
    ? await executor
        .select({
          automationId: databaseAutomation.id,
          definition: databaseAutomationRevision.definition,
        })
        .from(databaseAutomation)
        .innerJoin(
          databaseAutomationRevision,
          eq(databaseAutomationRevision.id, databaseAutomation.currentRevisionId),
        )
        .where(
          and(
            eq(databaseAutomation.status, "active"),
            isNull(databaseAutomation.deletedAt),
            input.workspaceId ? eq(databaseAutomation.workspaceId, input.workspaceId) : undefined,
          ),
        )
    : [];
  const automationIds = [...new Set([
    ...rows.map(({ automationId }) => automationId),
    ...legacyOptionRows
      .filter(({ definition }) => hasOptionReference(definition, input.dependencyId))
      .map(({ automationId }) => automationId),
  ])];
  if (automationIds.length === 0) return 0;
  await executor
    .update(databaseAutomation)
    .set({
      errorActionId: null,
      errorCode: "DEPENDENCY_INVALID",
      errorSummary: input.reason.slice(0, 2_000),
      erroredAt: new Date(),
      nextRunAt: null,
      status: "error",
      updatedAt: new Date(),
    })
    .where(and(inArray(databaseAutomation.id, automationIds), eq(databaseAutomation.status, "active")));
  return automationIds.length;
}

