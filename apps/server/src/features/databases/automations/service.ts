import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import {
  DATABASE_AUTOMATION_LIMITS,
  databaseAutomationDefinitionSchema,
  getNextDatabaseAutomationOccurrence,
  type CreateDatabaseAutomationRequest,
  type CreateDatabaseAutomationSecretRequest,
  type DatabaseAutomationDefinition,
  type DatabaseAutomationDependency,
  type DatabaseAutomationDetail,
  type DatabaseAutomationSummary,
  type DatabaseAutomationValidationResult,
  type UpdateDatabaseAutomationRequest,
} from "@zilobase/features/databases/automations";

import { getMembership } from "../../access";
import { db, type Database } from "../../../infrastructure/database";
import {
  database,
  databaseAutomation,
  databaseAutomationDependency,
  databaseAutomationRevision,
  databaseDataSource,
  databaseProperty,
  databaseView,
  dataSource,
  automationSecret,
  gmailAccount,
  gmailWorkspaceConnection,
  pageProperty,
  member,
  user,
} from "../../../infrastructure/database/schema";
import type { ZilobaseEditionExtension } from "../../../shared/types";
import type { RuntimeEnv } from "../../../shared/config/config";
import { requireDataSourceAccess } from "../access/data-source-access";
import { requireDatabaseAccess } from "../access/database-access";
import {
  compileDatabaseAutomationDefinition,
  operatorsForPropertyType,
  type AutomationPropertyMetadata,
  type DatabaseAutomationCompilationContext,
} from "./compiler";
import { encryptAutomationSecret } from "./secret-crypto";
import { resolvePublicWebhookTarget } from "./webhook-egress";

type Executor = Database;
type AutomationRecord = typeof databaseAutomation.$inferSelect;
type RevisionRecord = typeof databaseAutomationRevision.$inferSelect;

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

export async function validateDatabaseAutomation(input: {
  allowHttpWebhookDomains?: Set<string>;
  databaseId: string;
  dataSourceId: string;
  definition: unknown;
  gmailEnabled?: boolean;
  webhooksEnabled?: boolean;
  userId: string;
}) {
  const management = await requireManagementContext(input);
  const compilationContext = await loadCompilationContext({
    allowHttpWebhookDomains: input.allowHttpWebhookDomains,
    databaseId: input.databaseId,
    definition: input.definition,
    gmailEnabled: input.gmailEnabled,
    webhooksEnabled: input.webhooksEnabled,
    management,
    userId: input.userId,
  });
  return compileDatabaseAutomationDefinition(input.definition, compilationContext).validation;
}

export async function createDatabaseAutomation(input: {
  allowHttpWebhookDomains?: Set<string>;
  body: CreateDatabaseAutomationRequest;
  databaseId: string;
  duplicatedFromId?: string;
  editionExtension?: ZilobaseEditionExtension;
  initialStatus?: "active" | "paused";
  gmailEnabled?: boolean;
  webhooksEnabled?: boolean;
  userId: string;
}) {
  const management = await requireManagementContext({
    databaseId: input.databaseId,
    dataSourceId: input.body.dataSourceId,
    userId: input.userId,
  });
  const context = await loadCompilationContext({
    allowHttpWebhookDomains: input.allowHttpWebhookDomains,
    databaseId: input.databaseId,
    definition: input.body.definition,
    gmailEnabled: input.gmailEnabled,
    webhooksEnabled: input.webhooksEnabled,
    management,
    userId: input.userId,
  });
  const compilation = compileDatabaseAutomationDefinition(input.body.definition, context);
  assertValidCompilation(compilation.validation, compilation.compiledDefinition, compilation.definitionHash);

  const createInTransaction = () => db.transaction(async (tx) => {
    await tx
      .select({ id: dataSource.id })
      .from(dataSource)
      .where(eq(dataSource.id, input.body.dataSourceId))
      .for("update");
    const existing = await findIdempotentAutomation(
      tx as Executor,
      input.userId,
      input.body.dataSourceId,
      input.body.idempotencyKey,
    );
    if (existing) return { created: false, ...existing };

    const initialStatus = input.initialStatus ?? "active";
    if (initialStatus === "active") {
      const [{ activeCount }] = await tx
        .select({ activeCount: count() })
        .from(databaseAutomation)
        .where(
          and(
            eq(databaseAutomation.dataSourceId, input.body.dataSourceId),
            eq(databaseAutomation.status, "active"),
            isNull(databaseAutomation.deletedAt),
          ),
        );
      if ((activeCount ?? 0) >= DATABASE_AUTOMATION_LIMITS.activePerDataSource) {
        throw new DatabaseAutomationError(
          "This data source has reached its active automation limit",
          409,
          "AUTOMATION_ACTIVE_LIMIT",
        );
      }
    }

    const now = new Date();
    const automationId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const nextRunAt = initialStatus === "active"
      ? nextScheduleRunAt(compilation.definition!, now)
      : null;
    await tx.insert(databaseAutomation).values({
      createIdempotencyKey: input.body.idempotencyKey,
      createdAt: now,
      createdById: input.userId,
      currentRevisionId: revisionId,
      dataSourceId: input.body.dataSourceId,
      duplicatedFromId: input.duplicatedFromId,
      id: automationId,
      name: input.body.name,
      nextRunAt,
      ownerUserId: input.userId,
      status: initialStatus,
      updatedAt: now,
      workspaceId: management.source.workspaceId,
    });
    await tx.insert(databaseAutomationRevision).values({
      automationId,
      compiledDefinition: compilation.compiledDefinition!,
      createdAt: now,
      createdById: input.userId,
      definition: compilation.definition!,
      definitionHash: compilation.definitionHash!,
      definitionVersion: compilation.definition!.definitionVersion,
      id: revisionId,
      version: 1,
    });
    await insertDependencies(tx as Executor, automationId, revisionId, compilation.compiledDefinition!.dependencies);
    return {
      automation: {
        id: automationId,
        workspaceId: management.source.workspaceId,
        dataSourceId: input.body.dataSourceId,
        createdById: input.userId,
        ownerUserId: input.userId,
        name: input.body.name,
        status: initialStatus,
        currentRevisionId: revisionId,
        createIdempotencyKey: input.body.idempotencyKey,
        duplicatedFromId: input.duplicatedFromId ?? null,
        nextRunAt,
        lastRunAt: null,
        lastRunStatus: null,
        errorCode: null,
        errorSummary: null,
        errorActionId: null,
        erroredAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      } satisfies AutomationRecord,
      created: true,
      revision: {
        automationId,
        compiledDefinition: compilation.compiledDefinition!,
        createdAt: now,
        createdById: input.userId,
        definition: compilation.definition!,
        definitionHash: compilation.definitionHash!,
        definitionVersion: compilation.definition!.definitionVersion,
        id: revisionId,
        version: 1,
      } satisfies RevisionRecord,
    };
  });
  let result: Awaited<ReturnType<typeof createInTransaction>>;
  try {
    result = await createInTransaction();
  } catch (error) {
    if (!isIdempotencyConflict(error)) throw error;
    const existing = await findIdempotentAutomation(
      db,
      input.userId,
      input.body.dataSourceId,
      input.body.idempotencyKey,
    );
    if (!existing) throw error;
    result = { created: false, ...existing };
  }

  if (result.created && !input.duplicatedFromId) {
    await audit(input.editionExtension, "database_automation.created", input.userId, result.automation, {
      revision: result.revision.version,
    });
  }
  return { automation: toDetail(result.automation, result.revision), created: result.created };
}

export async function updateDatabaseAutomation(input: {
  allowHttpWebhookDomains?: Set<string>;
  automationId: string;
  body: UpdateDatabaseAutomationRequest;
  databaseId: string;
  editionExtension?: ZilobaseEditionExtension;
  expectedVersion: number;
  gmailEnabled?: boolean;
  webhooksEnabled?: boolean;
  userId: string;
}) {
  const existing = await getAutomationWithRevision(input.automationId);
  if (!existing || existing.automation.deletedAt) throw notFound();
  const management = await requireManagementContext({
    databaseId: input.databaseId,
    dataSourceId: existing.automation.dataSourceId,
    userId: input.userId,
  });
  const context = await loadCompilationContext({
    allowHttpWebhookDomains: input.allowHttpWebhookDomains,
    databaseId: input.databaseId,
    definition: input.body.definition,
    gmailEnabled: input.gmailEnabled,
    webhooksEnabled: input.webhooksEnabled,
    management,
    userId: input.userId,
  });
  const compilation = compileDatabaseAutomationDefinition(input.body.definition, context);
  assertValidCompilation(compilation.validation, compilation.compiledDefinition, compilation.definitionHash);
  const transfersProtectedOwnership = containsGmailAction(input.body.definition) && existing.automation.ownerUserId !== input.userId;
  if (containsGmailAction(existing.revision.definition) && existing.automation.ownerUserId !== input.userId && !transfersProtectedOwnership) {
    throw protectedConfigurationError();
  }

  const result = await db.transaction(async (tx) => {
    const current = await getAutomationWithRevision(input.automationId, tx as Executor, true);
    if (!current || current.automation.deletedAt) throw notFound();
    if (current.revision.version !== input.expectedVersion) {
      throw new DatabaseAutomationError(
        "The automation was changed by another editor",
        409,
        "AUTOMATION_REVISION_CONFLICT",
      );
    }
    const now = new Date();
    const revisionId = crypto.randomUUID();
    const version = current.revision.version + 1;
    await tx.insert(databaseAutomationRevision).values({
      automationId: current.automation.id,
      compiledDefinition: compilation.compiledDefinition!,
      createdAt: now,
      createdById: input.userId,
      definition: compilation.definition!,
      definitionHash: compilation.definitionHash!,
      definitionVersion: compilation.definition!.definitionVersion,
      id: revisionId,
      version,
    });
    await insertDependencies(tx as Executor, current.automation.id, revisionId, compilation.compiledDefinition!.dependencies);
    const nextRunAt = current.automation.status === "active"
      ? nextScheduleRunAt(compilation.definition!, now)
      : null;
    const [automation] = await tx
      .update(databaseAutomation)
      .set({
        currentRevisionId: revisionId,
        name: input.body.name,
        nextRunAt,
        ...(transfersProtectedOwnership ? { ownerUserId: input.userId } : {}),
        updatedAt: now,
      })
      .where(eq(databaseAutomation.id, current.automation.id))
      .returning();
    return {
      automation: automation!,
      revision: {
        automationId: current.automation.id,
        compiledDefinition: compilation.compiledDefinition!,
        createdAt: now,
        createdById: input.userId,
        definition: compilation.definition!,
        definitionHash: compilation.definitionHash!,
        definitionVersion: compilation.definition!.definitionVersion,
        id: revisionId,
        version,
      } satisfies RevisionRecord,
    };
  });
  await audit(input.editionExtension, "database_automation.updated", input.userId, result.automation, {
    revision: result.revision.version,
  });
  return toDetail(result.automation, result.revision);
}

export async function setDatabaseAutomationPaused(input: {
  allowHttpWebhookDomains?: Set<string>;
  automationId: string;
  databaseId: string;
  editionExtension?: ZilobaseEditionExtension;
  gmailEnabled?: boolean;
  webhooksEnabled?: boolean;
  paused: boolean;
  userId: string;
}) {
  const record = await getLifecycleAutomation(input);
  const current = toDetail(record.automation, record.revision);
  if (!input.paused) {
    const validation = await validateDatabaseAutomation({
      allowHttpWebhookDomains: input.allowHttpWebhookDomains,
      databaseId: input.databaseId,
      dataSourceId: current.dataSourceId,
      definition: current.definition,
      gmailEnabled: input.gmailEnabled,
      webhooksEnabled: input.webhooksEnabled,
      userId: input.userId,
    });
    if (!validation.valid) throw new DatabaseAutomationError(
      "The automation must be repaired before it can resume",
      409,
      "AUTOMATION_REPAIR_REQUIRED",
      validation,
    );
  }
  const now = new Date();
  const [automation] = await db
    .update(databaseAutomation)
    .set({
      errorActionId: null,
      errorCode: null,
      errorSummary: null,
      erroredAt: null,
      status: input.paused ? "paused" : "active",
      nextRunAt: input.paused ? null : nextScheduleRunAt(current.definition, now),
      updatedAt: now,
    })
    .where(and(eq(databaseAutomation.id, input.automationId), isNull(databaseAutomation.deletedAt)))
    .returning();
  if (!automation) throw notFound();
  await audit(
    input.editionExtension,
    input.paused ? "database_automation.paused" : "database_automation.resumed",
    input.userId,
    automation,
    {},
  );
  const detail = await getAutomationWithRevision(input.automationId);
  return protectedLifecycleResponse(detail!.automation, detail!.revision, input.userId);
}

export async function duplicateDatabaseAutomation(input: {
  allowHttpWebhookDomains?: Set<string>;
  automationId: string;
  databaseId: string;
  editionExtension?: ZilobaseEditionExtension;
  idempotencyKey: string;
  gmailEnabled?: boolean;
  webhooksEnabled?: boolean;
  userId: string;
}) {
  const source = await getDatabaseAutomation({
    automationId: input.automationId,
    databaseId: input.databaseId,
    userId: input.userId,
  });
  const created = await createDatabaseAutomation({
    allowHttpWebhookDomains: input.allowHttpWebhookDomains,
    body: {
      dataSourceId: source.dataSourceId,
      definition: definitionForDuplicate(source.definition),
      idempotencyKey: createHash("sha256")
        .update(`duplicate:${source.id}:${input.idempotencyKey}`)
        .digest("hex"),
      name: `${source.name} copy`.slice(0, 200),
    },
    databaseId: input.databaseId,
    duplicatedFromId: source.id,
    editionExtension: input.editionExtension,
    initialStatus: "paused",
    gmailEnabled: input.gmailEnabled,
    webhooksEnabled: input.webhooksEnabled,
    userId: input.userId,
  });
  const detail = await getAutomationWithRevision(created.automation.id);
  if (created.created) {
    await audit(input.editionExtension, "database_automation.duplicated", input.userId, detail!.automation, {
      sourceAutomationId: source.id,
    });
  }
  return { automation: toDetail(detail!.automation, detail!.revision), created: created.created };
}

export async function deleteDatabaseAutomation(input: {
  automationId: string;
  databaseId: string;
  editionExtension?: ZilobaseEditionExtension;
  userId: string;
}) {
  const record = await getLifecycleAutomation(input);
  const current = toDetail(record.automation, record.revision);
  const now = new Date();
  const [automation] = await db
    .update(databaseAutomation)
    .set({
      deletedAt: now,
      errorActionId: null,
      errorCode: null,
      errorSummary: null,
      erroredAt: null,
      nextRunAt: null,
      status: "deleted",
      updatedAt: now,
    })
    .where(and(eq(databaseAutomation.id, current.id), isNull(databaseAutomation.deletedAt)))
    .returning();
  if (!automation) throw notFound();
  await audit(input.editionExtension, "database_automation.deleted", input.userId, automation, {});
  return { deleted: true, id: automation.id };
}

export async function createDatabaseAutomationSecret(input: {
  body: CreateDatabaseAutomationSecretRequest;
  databaseId: string;
  env: RuntimeEnv;
  userId: string;
  webhooksEnabled: boolean;
}) {
  if (!input.webhooksEnabled) {
    throw new DatabaseAutomationError("Webhook automations are disabled", 403, "AUTOMATION_WEBHOOKS_DISABLED");
  }
  const management = await requireManagementContext({
    databaseId: input.databaseId,
    dataSourceId: input.body.dataSourceId,
    userId: input.userId,
  });
  const id = crypto.randomUUID();
  const encrypted = await encryptAutomationSecret(input.env, input.body.value, {
    ownerUserId: input.userId,
    purpose: input.body.purpose,
    secretId: id,
    workspaceId: management.source.workspaceId,
  }).catch((error) => {
    throw new DatabaseAutomationError(
      error instanceof Error ? error.message : "Automation secret could not be encrypted",
      400,
      "AUTOMATION_SECRET_INVALID",
    );
  });
  await db.insert(automationSecret).values({
    ...encrypted,
    id,
    ownerUserId: input.userId,
    purpose: input.body.purpose,
    workspaceId: management.source.workspaceId,
  });
  return { id, purpose: input.body.purpose } as const;
}

export async function getDatabaseAutomationCatalog(input: {
  databaseId: string;
  dataSourceId: string;
  gmailEnabled?: boolean;
  webhooksEnabled?: boolean;
  userId: string;
}) {
  try {
    const management = await requireManagementContext(input);
    const [properties, views, users, gmailConnections] = await Promise.all([
      loadProperties([input.dataSourceId]),
      loadViews(input.databaseId, input.dataSourceId),
      loadWorkspaceUsers(management.source.workspaceId),
      input.gmailEnabled === false
        ? Promise.resolve([])
        : loadOwnedGmailConnections(management.source.workspaceId, input.userId),
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
        { available: false, reason: "Available in the Slack release", type: "send_slack" as const },
      ],
      canManage: true,
      dataSourceId: management.source.id,
      gmailConnections,
      manageUnavailableReason: null,
      properties: [...(properties.get(input.dataSourceId)?.values() ?? [])].map((property) => ({
        id: property.id,
        name: property.name,
        operators: [...operatorsForPropertyType(property.type)],
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
      gmailConnections: [],
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
  executor?: Executor;
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
  const automationIds = [...new Set(rows.map(({ automationId }) => automationId))];
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

async function requireManagementContext(input: {
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

async function loadCompilationContext(input: {
  allowHttpWebhookDomains?: Set<string>;
  databaseId: string;
  definition: unknown;
  gmailEnabled?: boolean;
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
  const [propertiesByDataSource, views, users, gmailConnections, secrets] = await Promise.all([
    loadProperties([...targetIds]),
    loadViews(input.databaseId, input.management.source.id),
    loadWorkspaceUsers(input.management.source.workspaceId),
    loadOwnedGmailConnections(input.management.source.workspaceId, input.userId),
    loadOwnedAutomationSecrets(input.management.source.workspaceId, input.userId),
  ]);
  return {
    allowHttpWebhookDomains: input.allowHttpWebhookDomains,
    capabilities: { gmail: input.gmailEnabled !== false, notifications: true, schedules: true, webhooks: input.webhooksEnabled !== false },
    dataSourceIds: targetIds,
    gmailConnectionIds: new Set(gmailConnections.filter(({ status }) => status === "connected").map(({ id }) => id)),
    invalidWebhookActionIds,
    parentDatabaseId: input.management.source.parentDatabaseId,
    propertiesByDataSource,
    secretIds: new Set(secrets.map(({ id }) => id)),
    sourceDataSourceId: input.management.source.id,
    userIds: new Set(users.map(({ id }) => id)),
    views,
  };
}

async function loadProperties(dataSourceIds: string[]) {
  const result = new Map<string, Map<string, AutomationPropertyMetadata>>();
  if (dataSourceIds.length === 0) return result;
  const records = await db
    .select({
      dataSourceId: databaseProperty.dataSourceId,
      config: pageProperty.config,
      id: databaseProperty.id,
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
    properties.set(record.id, {
      dataSourceId: record.dataSourceId,
      id: record.id,
      name: record.name,
      relatedDataSourceId: getRelatedDataSourceId(record.config),
      type: record.type,
      writable: !["button", "created_time", "edited_time", "formula", "id", "rollup"].includes(record.type),
    });
    result.set(record.dataSourceId, properties);
  }
  return result;
}

async function loadOwnedGmailConnections(workspaceId: string, userId: string) {
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

async function loadOwnedAutomationSecrets(workspaceId: string, userId: string) {
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

async function getLifecycleAutomation(input: {
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

function containsGmailAction(definition: unknown) {
  const parsed = databaseAutomationDefinitionSchema.safeParse(definition);
  return parsed.success && parsed.data.actions.some((action) => action.type === "send_gmail");
}

function definitionForDuplicate(definition: DatabaseAutomationDefinition): DatabaseAutomationDefinition {
  return {
    ...definition,
    actions: definition.actions.map((action) => action.type === "send_webhook"
      ? { ...action, headers: [] }
      : action),
  };
}

function assertProtectedDefinitionOwner(
  automation: AutomationRecord,
  revision: RevisionRecord,
  userId: string,
) {
  if (containsGmailAction(revision.definition) && automation.ownerUserId !== userId) {
    throw protectedConfigurationError();
  }
}

function protectedLifecycleResponse(
  automation: AutomationRecord,
  revision: RevisionRecord,
  userId: string,
) {
  return containsGmailAction(revision.definition) && automation.ownerUserId !== userId
    ? toSummary(automation, revision)
    : toDetail(automation, revision);
}

function protectedConfigurationError() {
  return new DatabaseAutomationError(
    "This automation contains protected Gmail configuration owned by another user",
    403,
    "AUTOMATION_PROTECTED_CONFIGURATION",
  );
}

async function loadViews(databaseId: string, dataSourceId: string) {
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

async function loadWorkspaceUsers(workspaceId: string) {
  const now = new Date();
  return db.select({ id: user.id, name: user.name }).from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(
      eq(member.organizationId, workspaceId),
      or(isNull(member.accessExpiresAt), gt(member.accessExpiresAt, now)),
    ))
    .orderBy(asc(user.name), asc(user.id));
}

async function getAutomationWithRevision(
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

async function findIdempotentAutomation(
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

async function insertDependencies(
  executor: Executor,
  automationId: string,
  revisionId: string,
  dependencies: Array<{ dependencyId: string; dependencyType: any; usage: string }>,
) {
  if (dependencies.length === 0) return;
  await executor.insert(databaseAutomationDependency).values(
    dependencies.map((dependency) => ({ automationId, revisionId, ...dependency })),
  );
}

function assertValidCompilation(
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

function toSummary(automation: AutomationRecord, revision: RevisionRecord): DatabaseAutomationSummary {
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

function nextScheduleRunAt(definition: DatabaseAutomationDefinition, now: Date) {
  return definition.trigger.kind === "schedule"
    ? getNextDatabaseAutomationOccurrence(definition.trigger.schedule, now)
    : null;
}

function toDetail(automation: AutomationRecord, revision: RevisionRecord): DatabaseAutomationDetail {
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

function notFound() {
  return new DatabaseAutomationError("Automation not found", 404, "AUTOMATION_NOT_FOUND");
}

async function audit(
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

function isIdempotencyConflict(error: unknown) {
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
