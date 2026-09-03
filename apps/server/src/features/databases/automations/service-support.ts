import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { databaseAutomationDefinitionSchema, getNextDatabaseAutomationOccurrence, type DatabaseAutomationDefinition, type DatabaseAutomationDependency, type DatabaseAutomationDetail, type DatabaseAutomationSummary, type DatabaseAutomationValidationResult } from "@zilobase/features/databases/automations";
import { canAccessDatabaseRecord, getMembership } from "../../access";
import { db, type Database } from "../../../infrastructure/database";
import { database, databaseAutomation, databaseAutomationDependency, databaseAutomationRevision, databaseDataSource, databaseProperty, databaseView, dataSource, automationSecret, gmailAccount, gmailWorkspaceConnection, pageProperty, slackConnection, member, user } from "../../../infrastructure/database/schema";
import type { ZilobaseEditionExtension } from "../../../shared/types";
import { requireDataSourceAccess } from "../access/data-source-access";
import { requireDatabaseAccess } from "../access/database-access";
import { operatorsForPropertyType, type AutomationPropertyMetadata, type DatabaseAutomationCompilationContext } from "./compiler";
import { resolvePublicWebhookTarget } from "./webhook-egress";


export type Executor = Database;
export type AutomationRecord = typeof databaseAutomation.$inferSelect;
export type RevisionRecord = typeof databaseAutomationRevision.$inferSelect;

export class DatabaseAutomationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
    readonly code = "AUTOMATION_INVALID_REQUEST",
    readonly validation?: DatabaseAutomationValidationResult,
  ) {
    super(message);
    this.name = "DatabaseAutomationError";
  }
}

export function hasOptionReference(value: unknown, optionId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => hasOptionReference(item, optionId));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.entityType === "option" && record.type === "entity") {
    return record.id === optionId;
  }
  if (record.entityType === "option" && record.type === "entity_list") {
    return Array.isArray(record.ids) && record.ids.includes(optionId);
  }
  return Object.values(record).some((item) => hasOptionReference(item, optionId));
}

export async function requireManagementContext(input: {
  databaseId: string;
  dataSourceId: string;
  userId: string;
}) {
  let source: Awaited<ReturnType<typeof requireDataSourceAccess>>;
  try {
    source = await requireDataSourceAccess(input.dataSourceId, input.userId, "full");
  } catch (error) {
    throw new DatabaseAutomationError(
      error instanceof Error ? error.message : "Forbidden",
      error instanceof Error && "status" in error && error.status === 404 ? 404 : 403,
      "AUTOMATION_MANAGE_FORBIDDEN",
    );
  }
  const membership = await getMembership(source.workspaceId, input.userId);
  if (!membership) {
    throw new DatabaseAutomationError(
      "Only active workspace members with full access can manage automations",
      403,
      "AUTOMATION_MEMBER_REQUIRED",
    );
  }
  try {
    await requireDatabaseAccess(input.databaseId, input.userId, "view");
  } catch {
    throw new DatabaseAutomationError(
      "The database containing this linked source is not accessible",
      403,
      "AUTOMATION_HOST_FORBIDDEN",
    );
  }
  const [link, parent] = await Promise.all([
    db
      .select({ databaseId: databaseDataSource.databaseId })
      .from(databaseDataSource)
      .where(
        and(
          eq(databaseDataSource.databaseId, input.databaseId),
          eq(databaseDataSource.dataSourceId, input.dataSourceId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(database)
      .where(and(eq(database.id, source.parentDatabaseId), isNull(database.deletedAt)))
      .limit(1),
  ]);
  if (!link[0]) throw new DatabaseAutomationError("Data source is not linked to this database", 404, "AUTOMATION_SOURCE_NOT_LINKED");
  if (!parent[0]) throw new DatabaseAutomationError("Source database not found", 404, "AUTOMATION_SOURCE_NOT_FOUND");
  if (isDatabaseLocked(parent[0]) || isDatabaseLocked(source)) {
    throw new DatabaseAutomationError("Unlock the source database before managing automations", 409, "AUTOMATION_SOURCE_LOCKED");
  }
  return { membership, parent: parent[0], source };
}

export async function loadCompilationContext(input: {
  allowHttpWebhookDomains?: Set<string>;
  databaseId: string;
  definition: unknown;
  gmailEnabled?: boolean;
  slackEnabled?: boolean;
  webhooksEnabled?: boolean;
  management: Awaited<ReturnType<typeof requireManagementContext>>;
  userId: string;
}): Promise<DatabaseAutomationCompilationContext> {
  const parsed = databaseAutomationDefinitionSchema.safeParse(input.definition);
  const targetIds = new Set([input.management.source.id]);
  const sourcePropertiesByDataSource = await loadProperties([input.management.source.id]);
  const sourceProperties = sourcePropertiesByDataSource.get(input.management.source.id) ?? new Map();
  if (parsed.success) {
    for (const action of parsed.data.actions) {
      if (action.type === "add_page") targetIds.add(action.dataSourceId);
      if (action.type === "edit_pages" && action.target.type === "filtered_data_source") {
        targetIds.add(action.target.dataSourceId);
      }
      if (action.type === "edit_pages" && action.target.type === "related_pages") {
        const relatedDataSourceId = sourceProperties.get(action.target.propertyId)?.relatedDataSourceId;
        if (relatedDataSourceId) targetIds.add(relatedDataSourceId);
      }
    }
  }
  const invalidWebhookActionIds = new Set<string>();
  if (parsed.success && input.webhooksEnabled !== false) {
    await Promise.all(parsed.data.actions.flatMap((action) => action.type === "send_webhook"
      ? [resolvePublicWebhookTarget(action.url, { allowHttpDomains: input.allowHttpWebhookDomains })
          .catch(() => invalidWebhookActionIds.add(action.id))]
      : []));
  }
  for (const targetId of targetIds) {
    let target: Awaited<ReturnType<typeof requireDataSourceAccess>>;
    try {
      target = await requireDataSourceAccess(
        targetId,
        input.userId,
        targetId === input.management.source.id ? "full" : "edit",
      );
    } catch {
      targetIds.delete(targetId);
      continue;
    }
    if (target.workspaceId !== input.management.source.workspaceId) targetIds.delete(targetId);
  }
  const [propertiesByDataSource, views, users, gmailConnections, secrets, slackConnections] = await Promise.all([
    loadProperties([...targetIds]),
    loadViews(input.databaseId, input.management.source.id),
    loadWorkspaceUsers(input.management.source.workspaceId),
    loadOwnedGmailConnections(input.management.source.workspaceId, input.userId),
    loadOwnedAutomationSecrets(input.management.source.workspaceId, input.userId),
    loadOwnedSlackConnections(input.management.source.workspaceId, input.userId),
  ]);
  return {
    allowHttpWebhookDomains: input.allowHttpWebhookDomains,
    capabilities: { gmail: input.gmailEnabled !== false, notifications: true, schedules: true, slack: input.slackEnabled !== false, webhooks: input.webhooksEnabled !== false },
    dataSourceIds: targetIds,
    gmailConnectionIds: new Set(gmailConnections.filter(({ status }) => status === "connected").map(({ id }) => id)),
    invalidWebhookActionIds,
    parentDatabaseId: input.management.source.parentDatabaseId,
    propertiesByDataSource,
    secretIds: new Set(secrets.map(({ id }) => id)),
    slackConnectionIds: new Set(slackConnections.filter(({ status }) => status === "connected").map(({ id }) => id)),
    sourceDataSourceId: input.management.source.id,
    userIds: new Set(users.map(({ id }) => id)),
    views,
  };
}

export async function loadProperties(dataSourceIds: string[]) {
  const result = new Map<string, Map<string, AutomationPropertyMetadata>>();
  if (dataSourceIds.length === 0) return result;
  const records = await db
    .select({
      dataSourceId: databaseProperty.dataSourceId,
      config: pageProperty.config,
      id: pageProperty.id,
      name: pageProperty.name,
      type: pageProperty.type,
    })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        inArray(databaseProperty.dataSourceId, dataSourceIds),
        isNull(pageProperty.deletedAt),
      ),
    )
    .orderBy(asc(databaseProperty.position));
  for (const record of records) {
    const properties = result.get(record.dataSourceId) ?? new Map();
    const icon = getAutomationPropertyIcon(record.config);
    properties.set(record.id, {
      dataSourceId: record.dataSourceId,
      id: record.id,
      ...(icon ? { icon } : {}),
      name: record.name,
      options: getAutomationPropertyOptions(record.config),
      relatedDataSourceId: getRelatedDataSourceId(record.config),
      type: record.type,
      writable: !["button", "created_time", "edited_time", "formula", "id", "rollup"].includes(record.type),
    });
    result.set(record.dataSourceId, properties);
  }
  return result;
}

export async function loadAutomationTargetCatalog(workspaceId: string, userId: string) {
  const records = await db
    .select({ parent: database, source: dataSource })
    .from(dataSource)
    .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
    .where(
      and(
        eq(dataSource.workspaceId, workspaceId),
        isNull(dataSource.deletedAt),
        isNull(database.deletedAt),
      ),
    )
    .orderBy(asc(dataSource.name), asc(dataSource.id));
  const accessible = (await Promise.all(records.map(async (record) => {
    if (isDatabaseLocked(record.parent) || isDatabaseLocked(record.source)) return null;
    return await canAccessDatabaseRecord(record.parent, userId, "edit") ? record.source : null;
  }))).filter((source): source is typeof dataSource.$inferSelect => source !== null);
  const propertiesBySource = await loadProperties(accessible.map(({ id }) => id));
  return accessible.map((source) => ({
    id: source.id,
    name: source.name,
    properties: [...(propertiesBySource.get(source.id)?.values() ?? [])].map((property) => ({
      id: property.id,
      ...(property.icon ? { icon: property.icon } : {}),
      name: property.name,
      options: property.options ?? [],
      operators: [...operatorsForPropertyType(property.type)],
      ...(property.relatedDataSourceId ? { relatedDataSourceId: property.relatedDataSourceId } : {}),
      type: property.type,
      writable: property.writable,
    })),
  }));
}

function getAutomationPropertyOptions(config: unknown) {
  if (!config || typeof config !== "object" || !Array.isArray((config as { options?: unknown }).options)) return [];
  return (config as { options: unknown[] }).options.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const { color, id, name } = option as { color?: unknown; id?: unknown; name?: unknown };
    return typeof id === "string" && id.trim() && typeof name === "string" && name.trim()
      ? [{ ...(typeof color === "string" ? { color } : {}), id, name }]
      : [];
  });
}

function getAutomationPropertyIcon(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return "";
  const icon = (config as { icon?: unknown }).icon;
  return typeof icon === "string" ? icon : "";
}

export async function loadOwnedGmailConnections(workspaceId: string, userId: string) {
  return db
    .select({ email: gmailAccount.email, id: gmailAccount.id, status: gmailAccount.status })
    .from(gmailWorkspaceConnection)
    .innerJoin(
      gmailAccount,
      and(
        eq(gmailAccount.id, gmailWorkspaceConnection.gmailAccountId),
        eq(gmailAccount.userId, userId),
      ),
    )
    .where(
      and(
        eq(gmailWorkspaceConnection.workspaceId, workspaceId),
        eq(gmailWorkspaceConnection.userId, userId),
      ),
    )
    .then((connections) => connections.flatMap((connection) =>
      connection.status === "connected" || connection.status === "reconnect_required"
        ? [{ ...connection, status: connection.status as "connected" | "reconnect_required" }]
        : []
    ));
}

export async function loadOwnedAutomationSecrets(workspaceId: string, userId: string) {
  return db
    .select({ id: automationSecret.id })
    .from(automationSecret)
    .where(
      and(
        eq(automationSecret.workspaceId, workspaceId),
        eq(automationSecret.ownerUserId, userId),
        eq(automationSecret.purpose, "webhook_header"),
      ),
    );
}

export async function loadOwnedSlackConnections(workspaceId: string, userId: string) {
  return db.select({
    id: slackConnection.id,
    status: slackConnection.status,
    teamId: slackConnection.teamId,
    teamName: slackConnection.teamName,
  }).from(slackConnection).where(and(
    eq(slackConnection.workspaceId, workspaceId),
    eq(slackConnection.ownerUserId, userId),
  ));
}

export async function getLifecycleAutomation(input: {
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
  return record;
}

export function containsProtectedConnectorAction(definition: unknown) {
  const parsed = databaseAutomationDefinitionSchema.safeParse(definition);
  return parsed.success && parsed.data.actions.some((action) => action.type === "send_gmail" || action.type === "send_slack");
}

export function definitionForDuplicate(definition: DatabaseAutomationDefinition): DatabaseAutomationDefinition {
  return {
    ...definition,
    actions: definition.actions.map((action) => action.type === "send_webhook"
      ? { ...action, headers: [] }
      : action),
  };
}

export function assertProtectedDefinitionOwner(
  automation: AutomationRecord,
  revision: RevisionRecord,
  userId: string,
) {
  if (containsProtectedConnectorAction(revision.definition) && automation.ownerUserId !== userId) {
    throw protectedConfigurationError();
  }
}

export function protectedLifecycleResponse(
  automation: AutomationRecord,
  revision: RevisionRecord,
  userId: string,
) {
  return containsProtectedConnectorAction(revision.definition) && automation.ownerUserId !== userId
    ? toSummary(automation, revision)
    : toDetail(automation, revision);
}

export function protectedConfigurationError() {
  return new DatabaseAutomationError(
    "This automation contains protected connector configuration owned by another user",
    403,
    "AUTOMATION_PROTECTED_CONFIGURATION",
  );
}

export async function loadViews(databaseId: string, dataSourceId: string) {
  const records = await db
    .select({
      dataSourceId: databaseView.dataSourceId,
      id: databaseView.id,
      name: databaseView.name,
      type: databaseView.type,
    })
    .from(databaseView)
    .where(and(eq(databaseView.databaseId, databaseId), eq(databaseView.dataSourceId, dataSourceId)));
  return new Map(records.map((view) => [view.id, view]));
}

export async function loadWorkspaceUsers(workspaceId: string) {
  const now = new Date();
  return db.select({ id: user.id, name: user.name }).from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(
      eq(member.organizationId, workspaceId),
      or(isNull(member.accessExpiresAt), gt(member.accessExpiresAt, now)),
    ))
    .orderBy(asc(user.name), asc(user.id));
}

export async function getAutomationWithRevision(
  automationId: string,
  executor: Executor = db,
  lock = false,
) {
  let query = executor
    .select({ automation: databaseAutomation, revision: databaseAutomationRevision })
    .from(databaseAutomation)
    .innerJoin(databaseAutomationRevision, eq(databaseAutomation.currentRevisionId, databaseAutomationRevision.id))
    .where(eq(databaseAutomation.id, automationId))
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [record] = await query;
  return record;
}

export async function findIdempotentAutomation(
  executor: Executor,
  userId: string,
  dataSourceId: string,
  idempotencyKey: string,
) {
  const [record] = await executor
    .select({ automation: databaseAutomation, revision: databaseAutomationRevision })
    .from(databaseAutomation)
    .innerJoin(databaseAutomationRevision, eq(databaseAutomation.currentRevisionId, databaseAutomationRevision.id))
    .where(
      and(
        eq(databaseAutomation.createdById, userId),
        eq(databaseAutomation.dataSourceId, dataSourceId),
        eq(databaseAutomation.createIdempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return record;
}

export async function insertDependencies(
  executor: Executor,
  automationId: string,
  revisionId: string,
  dependencies: DatabaseAutomationDependency[],
) {
  if (dependencies.length === 0) return;
  await executor.insert(databaseAutomationDependency).values(
    dependencies.map((dependency) => ({ automationId, revisionId, ...dependency })),
  );
}

export function assertValidCompilation(
  validation: DatabaseAutomationValidationResult,
  compiledDefinition: unknown,
  definitionHash: string | null,
): asserts compiledDefinition {
  if (!validation.valid || !compiledDefinition || !definitionHash) {
    throw new DatabaseAutomationError(
      "Automation definition is invalid",
      400,
      "AUTOMATION_VALIDATION_FAILED",
      validation,
    );
  }
}

export function toSummary(automation: AutomationRecord, revision: RevisionRecord): DatabaseAutomationSummary {
  const definition = databaseAutomationDefinitionSchema.parse(revision.definition);
  return {
    actionCount: definition.actions.length,
    currentRevisionId: automation.currentRevisionId,
    dataSourceId: automation.dataSourceId,
    id: automation.id,
    lastRunAt: automation.lastRunAt?.toISOString() ?? null,
    lastRunStatus: normalizeRunStatus(automation.lastRunStatus),
    name: automation.name,
    nextRunAt: automation.nextRunAt?.toISOString() ?? null,
    scopeSummary: definition.scope.type === "view" ? "Saved view" : "Entire data source",
    status: automation.status as DatabaseAutomationSummary["status"],
    triggerSummary: definition.trigger.kind === "event"
      ? `${definition.trigger.match === "all" ? "All" : "Any"} of ${definition.trigger.clauses.length} event trigger${definition.trigger.clauses.length === 1 ? "" : "s"}`
      : `${definition.trigger.schedule.frequency} schedule`,
    updatedAt: automation.updatedAt.toISOString(),
    version: revision.version,
    workspaceId: automation.workspaceId,
  };
}

export function nextScheduleRunAt(definition: DatabaseAutomationDefinition, now: Date) {
  return definition.trigger.kind === "schedule"
    ? getNextDatabaseAutomationOccurrence(definition.trigger.schedule, now)
    : null;
}

export function toDetail(automation: AutomationRecord, revision: RevisionRecord): DatabaseAutomationDetail {
  return {
    ...toSummary(automation, revision),
    createdAt: automation.createdAt.toISOString(),
    createdById: automation.createdById,
    definition: databaseAutomationDefinitionSchema.parse(revision.definition),
    errorActionId: automation.errorActionId,
    errorCode: automation.errorCode,
    errorSummary: automation.errorSummary,
    erroredAt: automation.erroredAt?.toISOString() ?? null,
    ownerUserId: automation.ownerUserId,
  };
}

function normalizeRunStatus(value: string | null) {
  return ["queued", "running", "succeeded", "failed", "skipped", "cancelled"].includes(value ?? "")
    ? value as DatabaseAutomationSummary["lastRunStatus"]
    : null;
}

export function notFound() {
  return new DatabaseAutomationError("Automation not found", 404, "AUTOMATION_NOT_FOUND");
}

export async function audit(
  editionExtension: ZilobaseEditionExtension | undefined,
  type: string,
  userId: string,
  automation: AutomationRecord,
  details: Record<string, boolean | number | string | null>,
) {
  await editionExtension?.recordSecurityEvent({
    actorUserId: userId,
    database: db,
    details: { automationId: automation.id, dataSourceId: automation.dataSourceId, ...details },
    occurredAt: new Date(),
    type,
    userId,
    workspaceId: automation.workspaceId,
  });
}

function isDatabaseLocked(record: { config: unknown }) {
  return Boolean(
    record.config &&
    typeof record.config === "object" &&
    !Array.isArray(record.config) &&
    (record.config as { locked?: unknown }).locked === true,
  );
}

export function isIdempotencyConflict(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505" &&
    (!("constraint" in error) ||
      typeof error.constraint !== "string" ||
      error.constraint === "database_automation_create_idempotency_unique"),
  );
}

function getRelatedDataSourceId(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  const relation = (config as { relation?: unknown }).relation;
  if (!relation || typeof relation !== "object" || Array.isArray(relation)) return undefined;
  const dataSourceId = (relation as { relatedDataSourceId?: unknown }).relatedDataSourceId;
  return typeof dataSourceId === "string" && dataSourceId ? dataSourceId : undefined;
}
