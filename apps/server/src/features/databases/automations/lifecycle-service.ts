import { createHash } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import { DATABASE_AUTOMATION_LIMITS, type CreateDatabaseAutomationRequest, type CreateDatabaseAutomationSecretRequest, type UpdateDatabaseAutomationRequest } from "@zilobase/features/databases/automations";
import { db } from "../../../infrastructure/database";
import { databaseAutomation, databaseAutomationRevision, dataSource, automationSecret } from "../../../infrastructure/database/schema";
import type { ZilobaseEditionExtension } from "../../../shared/types";
import type { RuntimeEnv } from "../../../shared/config/config";
import { compileDatabaseAutomationDefinition } from "./compiler";
import { encryptAutomationSecret } from "./secret-crypto";
import { getDatabaseAutomation } from "./read-service";
import { validateDatabaseAutomation } from "./validation-service";
import { DatabaseAutomationError, requireManagementContext, loadCompilationContext, getLifecycleAutomation, containsProtectedConnectorAction, definitionForDuplicate, protectedLifecycleResponse, protectedConfigurationError, getAutomationWithRevision, findIdempotentAutomation, insertDependencies, assertValidCompilation, nextScheduleRunAt, toDetail, notFound, audit, isIdempotencyConflict, type AutomationRecord, type Executor, type RevisionRecord } from "./service-support";

export async function createDatabaseAutomation(input: {
  allowHttpWebhookDomains?: Set<string>;
  body: CreateDatabaseAutomationRequest;
  databaseId: string;
  duplicatedFromId?: string;
  editionExtension?: ZilobaseEditionExtension;
  initialStatus?: "active" | "paused";
  gmailEnabled?: boolean;
  slackEnabled?: boolean;
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
    slackEnabled: input.slackEnabled,
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
  slackEnabled?: boolean;
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
    slackEnabled: input.slackEnabled,
    webhooksEnabled: input.webhooksEnabled,
    management,
    userId: input.userId,
  });
  const compilation = compileDatabaseAutomationDefinition(input.body.definition, context);
  assertValidCompilation(compilation.validation, compilation.compiledDefinition, compilation.definitionHash);
  const transfersProtectedOwnership = containsProtectedConnectorAction(input.body.definition) && existing.automation.ownerUserId !== input.userId;
  if (containsProtectedConnectorAction(existing.revision.definition) && existing.automation.ownerUserId !== input.userId && !transfersProtectedOwnership) {
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
  slackEnabled?: boolean;
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
      slackEnabled: input.slackEnabled,
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
  slackEnabled?: boolean;
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
    slackEnabled: input.slackEnabled,
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
