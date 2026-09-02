import { createHash } from "node:crypto";
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  databaseAutomationDefinitionSchema,
  type AutomationFilterDefinition,
  type AutomationValueExpression,
  type DatabaseAutomationAction,
  type DatabaseAutomationDefinition,
} from "@zilobase/features/databases/automations";
import {
  evaluateDatabaseFormula,
  type DatabaseFormulaProperty,
  getZonedDateParts,
  type FormulaValue,
} from "@zilobase/features/databases/formula";

import { getAutomationWebhookHttpDomains, isAutomationSlackEnabled, isAutomationWebhooksEnabled, isMailFeatureEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { isSelfHostedRuntime } from "../../../infrastructure/runtime/runtime-adapter";
import { db } from "../../../infrastructure/database";
import {
  database,
  databaseAutomation,
  databaseAutomationDelivery,
  databaseAutomationRevision,
  databaseAutomationRun,
  databaseAutomationStepRun,
  automationSecret,
  databaseProperty,
  databaseRow,
  dataSource,
  gmailAccount,
  gmailWorkspaceConnection,
  member,
  page,
  pageProperty,
  slackConnection,
  pagePropertyValue,
  user,
} from "../../../infrastructure/database/schema";
import { requireDataSourceAccess } from "../access/data-source-access";
import { getEffectivePageAccessForUsers } from "../../access";
import { createDatabaseRowService } from "../rows/service";
import {
  applyDatabaseAutomationRowOperations,
  type ResolvedAutomationPropertyOperation,
} from "./internal-mutations";
import { matchesAutomationFilterDefinition } from "./trigger-evaluator";
import { invalidateDatabaseAutomationDependencies } from "./service";
import {
  accessibleNotificationPageId,
  activeNotificationRecipientIds,
  createAutomationNotifications,
} from "../../notifications/service";
import { createGmailGateway, clearGmailAccessTokenCache, GmailApiError } from "../../mail/gmail-gateway";
import { sendGmailComposition } from "../../mail/mail-compose";
import { parseMailComposeRequest } from "../../mail/mail-mime";
import { withMailUserConcurrency } from "../../mail/user-concurrency";
import { decryptAutomationSecret } from "./secret-crypto";
import { sendPinnedWebhook, validateWebhookHeaderName, WebhookEgressError } from "./webhook-egress";
import { listSlackChannels, sendSlackMessage, SlackProviderError } from "./slack-provider";

const RUN_LEASE_MS = 2 * 60_000;

type ExecutionContext = Awaited<ReturnType<typeof loadExecutionContext>> & {
  actionOutputs: Record<string, Record<string, unknown>>;
  variables: Record<string, FormulaValue>;
};

class AutomationActionError extends Error {
  constructor(
    message: string,
    readonly code = "AUTOMATION_ACTION_FAILED",
    readonly actionId: string | null = null,
  ) {
    super(message);
    this.name = "AutomationActionError";
  }
}

export async function drainDatabaseAutomationRuns(
  env: RuntimeEnv,
  options: { limit?: number; runId?: string; workerId?: string } = {},
) {
  const now = new Date();
  const workerId = options.workerId ?? `automation-runner:${crypto.randomUUID()}`;
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: databaseAutomationRun.id })
      .from(databaseAutomationRun)
      .where(
        and(
          options.runId ? eq(databaseAutomationRun.id, options.runId) : undefined,
          or(
            eq(databaseAutomationRun.status, "queued"),
            and(
              eq(databaseAutomationRun.status, "running"),
              lte(databaseAutomationRun.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(databaseAutomationRun.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (!rows.length) return [];
    return tx
      .update(databaseAutomationRun)
      .set({
        attempts: sql`${databaseAutomationRun.attempts} + 1`,
        leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
        leaseOwner: workerId,
        startedAt: sql`coalesce(${databaseAutomationRun.startedAt}, ${now})`,
        status: "running",
        updatedAt: now,
      })
      .where(inArray(databaseAutomationRun.id, rows.map((row) => row.id)))
      .returning({ id: databaseAutomationRun.id });
  });

  let failed = 0;
  let succeeded = 0;
  for (const run of claimed) {
    const result = await executeRun(run.id, workerId, env);
    if (result === "succeeded") succeeded += 1;
    else failed += 1;
  }
  return { claimed: claimed.length, failed, succeeded };
}

async function executeRun(runId: string, workerId: string, env: RuntimeEnv) {
  let loaded: Awaited<ReturnType<typeof loadExecutionContext>>;
  try {
    loaded = await loadExecutionContext(runId, workerId);
  } catch (error) {
    await failClaimedRun(runId, workerId, actionFailure(error));
    return "failed" as const;
  }
  if (!loaded) return "failed" as const;
  const context: ExecutionContext = {
    ...loaded,
    actionOutputs: {},
    variables: {},
  };
  for (const step of loaded.completedSteps) {
    restoreStepOutput(context, step.actionId, step.outputSummary);
  }

  if (context.automation.status !== "active") {
    await skipClaimedRun(runId, workerId, "automation_inactive");
    return "succeeded" as const;
  }

  try {
    await requireDataSourceAccess(
      context.run.dataSourceId,
      requireOwner(context.automation.ownerUserId),
      "full",
    );
    const [source] = await db
      .select({ config: database.config })
      .from(dataSource)
      .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
      .where(eq(dataSource.id, context.run.dataSourceId))
      .limit(1);
    if (
      !source ||
      (source.config &&
        typeof source.config === "object" &&
        !Array.isArray(source.config) &&
        (source.config as { locked?: unknown }).locked === true)
    ) {
      throw new AutomationActionError("The source database is locked", "AUTOMATION_SOURCE_LOCKED");
    }

    for (const [actionIndex, action] of context.definition.actions.entries()) {
      if (context.completedSteps.some((step) => step.actionId === action.id)) continue;
      const step = await startStep(context.run.id, action.id, actionIndex);
      try {
        const output = await executeAction(context, action, env);
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
        const failure = actionFailure(error, action.id);
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
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(databaseAutomationRun)
        .set({
          finishedAt: now,
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "succeeded",
          updatedAt: now,
        })
        .where(and(eq(databaseAutomationRun.id, runId), eq(databaseAutomationRun.leaseOwner, workerId)));
      await tx
        .update(databaseAutomation)
        .set({ lastRunAt: now, lastRunStatus: "succeeded", updatedAt: now })
        .where(eq(databaseAutomation.id, context.automation.id));
    });
    return "succeeded" as const;
  } catch (error) {
    const failure = actionFailure(error);
    await failClaimedRun(runId, workerId, failure, context.automation.id);
    return "failed" as const;
  }
}

async function loadExecutionContext(runId: string, workerId: string) {
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
  if (!existing) throw new AutomationActionError("Action receipt was unavailable");
  if (existing.status === "succeeded") return existing;
  const [claimed] = await db
    .update(databaseAutomationStepRun)
    .set({ attempts: existing.attempts + 1, startedAt: now, status: "running", updatedAt: now })
    .where(eq(databaseAutomationStepRun.id, existing.id))
    .returning();
  return claimed!;
}

async function executeAction(
  context: ExecutionContext,
  action: DatabaseAutomationAction,
  env: RuntimeEnv,
): Promise<Record<string, unknown>> {
  const actorId = requireOwner(context.automation.ownerUserId);
  if (action.type === "define_variables") {
    const variables: Record<string, FormulaValue> = {};
    for (const variable of action.variables) {
      const value = resolveExpression(context, variable.expression);
      assertBoundedValue(value);
      variables[variable.name] = value as FormulaValue;
      context.variables[variable.name] = value as FormulaValue;
    }
    return { variables };
  }
  if (action.type === "edit_trigger_page") {
    const row = requireTriggerRow(context);
    const operations = resolveOperations(context, action.operations);
    await applyDatabaseAutomationRowOperations({
      actorId,
      dataSourceId: context.run.dataSourceId,
      env,
      operations,
      rows: [{ pageId: row.pageId, rowId: row.id }],
      runId: context.run.id,
    });
    return { editedRows: 1 };
  }
  if (action.type === "add_page") {
    const operations = resolveOperations(context, action.operations);
    const titleOperation = operations.find((operation) => operation.propertyId === "name");
    const suffix = stableActionSuffix(context.run.id, action.id);
    const existing = await db
      .select({ pageId: databaseRow.pageId })
      .from(databaseRow)
      .where(eq(databaseRow.id, `automation-row:${suffix}`))
      .limit(1);
    if (existing[0]) return { pageId: existing[0].pageId, rowId: `automation-row:${suffix}` };
    const created = await createDatabaseRowService({
      automationRunId: context.run.id,
      databaseId: action.dataSourceId,
      env,
      initialValues: operations
        .filter((operation) => operation.propertyId !== "name")
        .map((operation) => ({
          propertyId: operation.propertyId,
          value: operation.mode === "clear" || operation.mode === "remove" ? null : operation.value,
        })),
      newPageId: `automation-page:${suffix}`,
      newRowId: `automation-row:${suffix}`,
      origin: "automation",
      title: titleOperation?.mode === "clear"
        ? "Untitled"
        : String(titleOperation?.value ?? "").trim() || "Untitled",
      userId: actorId,
    });
    return { pageId: created.rowPageId, rowId: created.rowId };
  }
  if (action.type === "edit_pages") {
    const target = await resolveEditTarget(context, action);
    await applyDatabaseAutomationRowOperations({
      actorId,
      dataSourceId: target.dataSourceId,
      env,
      operations: resolveOperations(context, action.operations),
      rows: target.rows,
      runId: context.run.id,
    });
    return { editedRows: target.rows.length };
  }
  if (action.type === "send_notification") {
    const candidates = action.recipients.flatMap((recipient) => {
      if (recipient.type === "selected_user") return [recipient.userId];
      if (recipient.type === "trigger_person") return stringList(context.run.triggerActorId);
      if (recipient.type === "page_creator") return stringList(requireTriggerRow(context).createdById);
      if (recipient.type === "person_property") return userIds(context.propertyValues[recipient.propertyId]);
      return userIds(context.variables[recipient.variableName]);
    });
    const uniqueCandidates = [...new Set(candidates)];
    if (uniqueCandidates.length > 20) {
      throw new AutomationActionError("Notification has more than 20 recipients", "AUTOMATION_NOTIFICATION_RECIPIENT_LIMIT");
    }
    let recipientIds = await activeNotificationRecipientIds(
      context.automation.workspaceId,
      uniqueCandidates,
    );
    if (!recipientIds.length) {
      throw new AutomationActionError("Notification has no valid workspace recipient", "AUTOMATION_NOTIFICATION_NO_RECIPIENTS");
    }
    const message = resolveRichText(context, action.message);
    if (!message.trim()) {
      throw new AutomationActionError("Notification message is empty", "AUTOMATION_NOTIFICATION_MESSAGE_EMPTY");
    }
    const requestedPageId = action.pageLink ? scalarString(resolveExpression(context, action.pageLink)) : null;
    const pageId = await accessibleNotificationPageId(context.automation.workspaceId, requestedPageId);
    if (pageId) {
      const access = await getEffectivePageAccessForUsers(pageId, context.automation.workspaceId, recipientIds);
      recipientIds = recipientIds.filter((userId) => (access.get(userId) ?? "none") !== "none");
      if (!recipientIds.length) {
        throw new AutomationActionError("No notification recipient can access the linked page", "AUTOMATION_NOTIFICATION_NO_RECIPIENTS");
      }
    }
    const notifications = await createAutomationNotifications({
      actionId: action.id,
      automationId: context.automation.id,
      message,
      pageId,
      recipientIds,
      runId: context.run.id,
      workspaceId: context.automation.workspaceId,
    });
    return { deliveredRecipients: notifications.length };
  }
  if (action.type === "send_gmail") {
    return executeGmailAction(context, action, env);
  }
  if (action.type === "send_webhook") {
    return executeWebhookAction(context, action, env);
  }
  if (action.type === "send_slack") {
    return executeSlackAction(context, action, env);
  }
  throw new AutomationActionError("Automation action is not enabled", "AUTOMATION_CAPABILITY_DISABLED");
}

function resolveRichText(
  context: ExecutionContext,
  richText: Extract<DatabaseAutomationAction, { type: "send_notification" | "send_gmail" }>["message"],
  options: { label?: string; maxLength?: number } = {},
) {
  const message = richText.parts.map((part) =>
    part.type === "text" ? part.text : displayValue(resolveExpression(context, part.value))
  ).join("");
  const maxLength = options.maxLength ?? 20_000;
  if (message.length > maxLength) {
    throw new AutomationActionError(`${options.label ?? "Notification message"} exceeds ${maxLength.toLocaleString()} characters`, "AUTOMATION_MESSAGE_LIMIT");
  }
  return message;
}

async function executeWebhookAction(
  context: ExecutionContext,
  action: Extract<DatabaseAutomationAction, { type: "send_webhook" }>,
  env: RuntimeEnv,
) {
  if (!isAutomationWebhooksEnabled(env)) {
    throw new AutomationActionError("Webhook automation actions are disabled", "AUTOMATION_WEBHOOKS_DISABLED");
  }
  const ownerUserId = requireOwner(context.automation.ownerUserId);
  const secretIds = action.headers.map(({ secretId }) => secretId);
  const secretRows = secretIds.length ? await db
    .select()
    .from(automationSecret)
    .where(
      and(
        inArray(automationSecret.id, secretIds),
        eq(automationSecret.workspaceId, context.automation.workspaceId),
        eq(automationSecret.ownerUserId, ownerUserId),
        eq(automationSecret.purpose, "webhook_header"),
      ),
    ) : [];
  const secrets = new Map(secretRows.map((secret) => [secret.id, secret]));
  const customHeaders: Record<string, string> = {};
  for (const header of action.headers) {
    const secret = secrets.get(header.secretId);
    if (!secret) throw new AutomationActionError("Webhook header secret is unavailable", "AUTOMATION_WEBHOOK_SECRET_INVALID");
    const name = validateWebhookHeaderName(header.name);
    customHeaders[name] = await decryptAutomationSecret(env, secret, {
      ownerUserId,
      purpose: secret.purpose,
      secretId: secret.id,
      workspaceId: secret.workspaceId,
    });
  }
  const suffix = createHash("sha256").update(`${context.run.id}:${action.id}:${action.url}`).digest("hex");
  const deliveryId = `webhook_${suffix}`;
  const selectedProperties = Object.fromEntries(action.selectedPropertyIds.map((propertyId) => [
    propertyId,
    propertyId === "name" ? context.row?.title ?? null : context.propertyValues[propertyId] ?? null,
  ]));
  const fields = Object.fromEntries(action.payloadFields.map((field) => [field.key, toJson(resolveExpression(context, field.value))]));
  const pageId = context.row?.pageId ?? null;
  const pageUrl = pageId ? automationPageUrl(env.CLIENT_URL, pageId) : null;
  const body = JSON.stringify({
    actionId: action.id,
    deliveryId,
    fields,
    page: {
      id: pageId,
      properties: selectedProperties,
      url: pageUrl,
    },
    runId: context.run.id,
    schemaVersion: 1,
    timestamp: context.run.triggerTime.toISOString(),
  });
  const destinationHash = createHash("sha256").update(action.url).digest("hex");
  const now = new Date();
  await db.insert(databaseAutomationDelivery).values({
    actionId: action.id,
    attempts: 0,
    createdAt: now,
    deliveryId,
    destinationHash,
    id: crypto.randomUUID(),
    kind: "webhook",
    runId: context.run.id,
    status: "pending",
    updatedAt: now,
  }).onConflictDoNothing();
  const [receipt] = await db.select().from(databaseAutomationDelivery)
    .where(eq(databaseAutomationDelivery.deliveryId, deliveryId)).limit(1);
  if (receipt?.status === "succeeded") {
    return { deliveryId, responseStatus: receipt.responseStatus, reused: true };
  }
  const headers = {
    ...customHeaders,
    "content-type": "application/json",
    "x-zilobase-action-id": action.id,
    "x-zilobase-delivery-id": deliveryId,
    "x-zilobase-run-id": context.run.id,
    "x-zilobase-schema-version": "1",
  };
  const allowHttpDomains = isSelfHostedRuntime() ? getAutomationWebhookHttpDomains(env) : new Set<string>();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await db.update(databaseAutomationDelivery).set({
      attempts: sql`${databaseAutomationDelivery.attempts} + 1`,
      nextAttemptAt: null,
      status: "sending",
      updatedAt: new Date(),
    }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
    try {
      const result = await sendPinnedWebhook({ allowHttpDomains, body, headers, url: action.url });
      await db.update(databaseAutomationDelivery).set({
        errorCode: null,
        errorSummary: null,
        responseStatus: result.status,
        status: "succeeded",
        updatedAt: new Date(),
      }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
      return { deliveryId, responseStatus: result.status, reused: false };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof WebhookEgressError && error.retryable;
      if (!retryable || attempt === 4) break;
      const jitter = Number.parseInt(suffix.slice(attempt * 2, attempt * 2 + 2), 16) % 100;
      const retryDelay = Math.min(error.retryAfterMs ?? 250 * 2 ** (attempt - 1) + jitter, 2_000);
      const nextAttemptAt = new Date(Date.now() + retryDelay);
      await db.update(databaseAutomationDelivery).set({
        errorCode: error.code,
        nextAttemptAt,
        responseStatus: error.responseStatus,
        status: "retrying",
        updatedAt: new Date(),
      }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  const failure = lastError instanceof WebhookEgressError
    ? lastError
    : new WebhookEgressError("Webhook delivery failed", "AUTOMATION_WEBHOOK_NETWORK_FAILED", true);
  await db.update(databaseAutomationDelivery).set({
    errorCode: failure.code,
    errorSummary: failure.message.slice(0, 2_000),
    nextAttemptAt: null,
    responseStatus: failure.responseStatus,
    status: "failed",
    updatedAt: new Date(),
  }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
  throw new AutomationActionError(failure.message, failure.code);
}

function automationPageUrl(clientUrl: unknown, pageId: string) {
  const origin = typeof clientUrl === "string" ? clientUrl.split(",")[0]?.trim() : null;
  if (!origin) return null;
  try {
    return new URL(`/page/${encodeURIComponent(pageId)}`, origin).toString();
  } catch {
    return null;
  }
}

async function executeSlackAction(
  context: ExecutionContext,
  action: Extract<DatabaseAutomationAction, { type: "send_slack" }>,
  env: RuntimeEnv,
) {
  if (!isAutomationSlackEnabled(env)) throw new AutomationActionError("Slack automation actions are disabled", "AUTOMATION_SLACK_DISABLED");
  const ownerUserId = requireOwner(context.automation.ownerUserId);
  const [connection] = await db.select().from(slackConnection).where(and(
    eq(slackConnection.id, action.connectionId),
    eq(slackConnection.workspaceId, context.automation.workspaceId),
    eq(slackConnection.ownerUserId, ownerUserId),
  )).limit(1);
  if (!connection || connection.status !== "connected") throw new AutomationActionError("Slack connection must be reconnected", "SLACK_CONNECTION_REVOKED");
  const text = action.message.parts.map((part) => {
    if (part.type === "text") return escapeSlack(part.text);
    if (part.type === "value") return escapeSlack(displayValue(resolveExpression(context, part.value)));
    if (part.type === "slack_mention") return part.kind === "user" ? `<@${part.id}>` : `<#${part.id}>`;
    return `<${part.url}|${escapeSlack(part.label)}>`;
  }).join("");
  if (!text || text.length > 40_000) throw new AutomationActionError("Slack message must contain at most 40,000 characters", "AUTOMATION_MESSAGE_LIMIT");
  const suffix = createHash("sha256").update(`${context.run.id}:${action.id}:${action.connectionId}:${action.channelId}`).digest("hex");
  const deliveryId = `slack_${suffix}`;
  const destinationHash = createHash("sha256").update(`${action.connectionId}:${action.channelId}`).digest("hex");
  const now = new Date();
  await db.insert(databaseAutomationDelivery).values({
    actionId: action.id, attempts: 0, createdAt: now, deliveryId, destinationHash,
    id: crypto.randomUUID(), kind: "slack", runId: context.run.id, status: "pending", updatedAt: now,
  }).onConflictDoNothing();
  const [receipt] = await db.select().from(databaseAutomationDelivery).where(eq(databaseAutomationDelivery.deliveryId, deliveryId)).limit(1);
  if (receipt?.status === "succeeded") return { deliveryId, messageTs: receipt.providerReference, reused: true };
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await db.update(databaseAutomationDelivery).set({
      attempts: sql`${databaseAutomationDelivery.attempts} + 1`, nextAttemptAt: null, status: "sending", updatedAt: new Date(),
    }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
    try {
      const authorizedChannels = await listSlackChannels(env, connection);
      if (!authorizedChannels.some(({ id }) => id === action.channelId)) {
        throw new SlackProviderError("Slack channel is unavailable or is a direct message", "SLACK_CHANNEL_UNAVAILABLE", 409);
      }
      const result = await sendSlackMessage(env, connection, { channelId: action.channelId, deliveryId, text });
      await db.update(databaseAutomationDelivery).set({
        errorCode: null, errorSummary: null, providerReference: result.messageTs,
        status: "succeeded", updatedAt: new Date(),
      }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
      return { deliveryId, messageTs: result.messageTs, reused: false };
    } catch (error) {
      lastError = error;
      if (error instanceof SlackProviderError && error.code === "SLACK_CONNECTION_REVOKED") await markSlackConnectionRevoked(connection.id, error);
      if (!(error instanceof SlackProviderError) || !error.retryable || attempt === 4) break;
      const jitter = Number.parseInt(suffix.slice(attempt * 2, attempt * 2 + 2), 16) % 100;
      const delay = Math.min(error.retryAfterMs ?? 250 * 2 ** (attempt - 1) + jitter, 2_000);
      await db.update(databaseAutomationDelivery).set({
        errorCode: error.code, nextAttemptAt: new Date(Date.now() + delay), status: "retrying", updatedAt: new Date(),
      }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  const failure = lastError instanceof SlackProviderError ? lastError : new SlackProviderError("Slack delivery failed", "SLACK_DELIVERY_FAILED", 502, true);
  await db.update(databaseAutomationDelivery).set({
    errorCode: failure.code, errorSummary: failure.message.slice(0, 2_000), nextAttemptAt: null,
    status: "failed", updatedAt: new Date(),
  }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
  throw new AutomationActionError(failure.message, failure.code);
}

async function markSlackConnectionRevoked(connectionId: string, error: SlackProviderError) {
  if (error instanceof SlackProviderError && error.code === "SLACK_CONNECTION_REVOKED") {
    await db.update(slackConnection).set({ lastErrorCode: error.code, status: "revoked", updatedAt: new Date() })
      .where(eq(slackConnection.id, connectionId));
    await invalidateDatabaseAutomationDependencies({
      dependencyId: connectionId, dependencyType: "slack_connection",
      reason: "The automation owner's Slack connection was revoked",
    });
  }
}

function escapeSlack(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function executeGmailAction(
  context: ExecutionContext,
  action: Extract<DatabaseAutomationAction, { type: "send_gmail" }>,
  env: RuntimeEnv,
) {
  if (!isMailFeatureEnabled(env)) {
    throw new AutomationActionError("Gmail automation actions are disabled", "AUTOMATION_GMAIL_DISABLED");
  }
  const ownerUserId = requireOwner(context.automation.ownerUserId);
  const [owned] = await db
    .select({ connection: gmailAccount })
    .from(gmailWorkspaceConnection)
    .innerJoin(
      gmailAccount,
      and(
        eq(gmailAccount.id, gmailWorkspaceConnection.gmailAccountId),
        eq(gmailAccount.userId, ownerUserId),
      ),
    )
    .where(
      and(
        eq(gmailWorkspaceConnection.workspaceId, context.automation.workspaceId),
        eq(gmailWorkspaceConnection.userId, ownerUserId),
        eq(gmailWorkspaceConnection.gmailAccountId, action.connectionId),
      ),
    )
    .limit(1);
  if (!owned || owned.connection.status !== "connected") {
    throw new AutomationActionError(
      "The automation owner's Gmail account must be reconnected",
      "AUTOMATION_GMAIL_CONNECTION_INVALID",
    );
  }

  const [to, cc, bcc] = await Promise.all([
    resolveMailAddresses(context, action.to),
    resolveMailAddresses(context, action.cc),
    resolveMailAddresses(context, action.bcc),
  ]);
  const recipients = deduplicateMailAddresses(to, cc, bcc);
  if (!recipients.to.length && !recipients.cc.length && !recipients.bcc.length) {
    throw new AutomationActionError("Gmail action has no valid recipient", "AUTOMATION_GMAIL_NO_RECIPIENTS");
  }
  const subject = resolveRichText(context, action.subject, { label: "Gmail subject", maxLength: 998 });
  const bodyText = resolveRichText(context, action.message, { label: "Gmail message", maxLength: 5_000_000 });
  const senderName = action.displayName ? scalarString(resolveExpression(context, action.displayName))?.trim() : undefined;
  const replyToValue = action.replyTo ? scalarString(resolveExpression(context, action.replyTo))?.trim() : undefined;
  const operationHash = createHash("sha256").update(`${context.run.id}:${action.id}`).digest("hex");
  const deliveryId = `gmail_${operationHash}`;
  const destinationHash = createHash("sha256")
    .update([...recipients.to, ...recipients.cc, ...recipients.bcc].map(({ address }) => address).sort().join("\n"))
    .digest("hex");
  const compose = parseMailComposeRequest({
    attachments: [],
    bcc: recipients.bcc,
    bodyText,
    cc: recipients.cc,
    clientOperationId: operationHash,
    ...(replyToValue ? { replyTo: { address: replyToValue, name: null } } : {}),
    ...(senderName ? { senderName } : {}),
    subject,
    to: recipients.to,
  }, { requireRecipient: true });

  const now = new Date();
  await db.insert(databaseAutomationDelivery).values({
    actionId: action.id,
    attempts: 0,
    createdAt: now,
    deliveryId,
    destinationHash,
    id: crypto.randomUUID(),
    kind: "gmail",
    runId: context.run.id,
    status: "pending",
    updatedAt: now,
  }).onConflictDoNothing();
  const [receipt] = await db
    .select()
    .from(databaseAutomationDelivery)
    .where(eq(databaseAutomationDelivery.deliveryId, deliveryId))
    .limit(1);
  if (receipt?.status === "succeeded") {
    return { deliveryId, providerReference: receipt.providerReference, reused: true };
  }
  await db
    .update(databaseAutomationDelivery)
    .set({ attempts: sql`${databaseAutomationDelivery.attempts} + 1`, status: "sending", updatedAt: new Date() })
    .where(eq(databaseAutomationDelivery.deliveryId, deliveryId));

  try {
    const result = await withMailUserConcurrency(ownerUserId, async () => {
      const gateway = await createGmailGateway(env, owned.connection);
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await sendGmailComposition({ compose, connection: owned.connection, gateway, userId: ownerUserId });
        } catch (error) {
          lastError = error;
          if (!(error instanceof GmailApiError) || !error.retryable || attempt === 3) throw error;
          await db
            .update(databaseAutomationDelivery)
            .set({ attempts: sql`${databaseAutomationDelivery.attempts} + 1`, status: "retrying", updatedAt: new Date() })
            .where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
        }
      }
      throw lastError;
    });
    await db
      .update(databaseAutomationDelivery)
      .set({
        errorCode: null,
        errorSummary: null,
        providerReference: result.message.id,
        status: "succeeded",
        updatedAt: new Date(),
      })
      .where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
    return { deliveryId, providerReference: result.message.id, reused: result.reused };
  } catch (error) {
    const code = error instanceof GmailApiError ? error.code : "provider_error";
    if (error instanceof GmailApiError && error.code === "authorization_revoked") {
      clearGmailAccessTokenCache(owned.connection.id);
      await db
        .update(gmailAccount)
        .set({ lastErrorCode: error.code, status: "reconnect_required", updatedAt: new Date() })
        .where(eq(gmailAccount.id, owned.connection.id));
      await invalidateDatabaseAutomationDependencies({
        dependencyId: owned.connection.id,
        dependencyType: "gmail_connection",
        reason: "Reconnect the automation owner's Gmail account",
      });
    }
    await db
      .update(databaseAutomationDelivery)
      .set({
        errorCode: code,
        errorSummary: error instanceof Error ? error.message.slice(0, 2_000) : "Gmail delivery failed",
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
    throw new AutomationActionError(
      error instanceof Error ? error.message : "Gmail delivery failed",
      error instanceof GmailApiError && error.code === "authorization_revoked"
        ? "AUTOMATION_GMAIL_RECONNECT_REQUIRED"
        : "AUTOMATION_GMAIL_DELIVERY_FAILED",
    );
  }
}

async function resolveMailAddresses(
  context: ExecutionContext,
  expressions: AutomationValueExpression[],
) {
  const values = expressions.flatMap((expression) => flattenAddressValues(resolveExpression(context, expression)));
  const userIds = values.filter((value) => !looksLikeEmail(value));
  const users = userIds.length
    ? await db
        .select({ email: user.email, id: user.id, name: user.name })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, context.automation.workspaceId),
            inArray(member.userId, [...new Set(userIds)]),
          ),
        )
    : [];
  const usersById = new Map(users.map((item) => [item.id, item]));
  return values.flatMap((value) => {
    if (looksLikeEmail(value)) return [{ address: value.trim().toLowerCase(), name: null }];
    const selected = usersById.get(value);
    return selected?.email ? [{ address: selected.email.trim().toLowerCase(), name: selected.name || null }] : [];
  });
}

function flattenAddressValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(flattenAddressValues);
  const scalar = scalarString(value);
  return scalar ? scalar.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function looksLikeEmail(value: string) {
  return value.includes("@") && !/[\r\n\0]/.test(value);
}

function deduplicateMailAddresses(
  to: Array<{ address: string; name: string | null }>,
  cc: Array<{ address: string; name: string | null }>,
  bcc: Array<{ address: string; name: string | null }>,
) {
  const seen = new Set<string>();
  const unique = (addresses: Array<{ address: string; name: string | null }>) => addresses.filter(({ address }) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { to: unique(to), cc: unique(cc), bcc: unique(bcc) };
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  if (typeof value === "object") return scalarString(value) ?? "";
  return String(value);
}

function scalarString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" ? record.id : null;
}

function userIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).flatMap((item) => {
    const id = scalarString(item);
    return id ? [id] : [];
  });
}

function resolveExpression(context: ExecutionContext, expression: AutomationValueExpression): unknown {
  if (expression.type === "literal") return expression.value;
  if (expression.type === "formula") {
    const row = context.row;
    const result = evaluateDatabaseFormula({
      expression: expression.expression,
      now: context.run.triggerTime,
      properties: context.properties as DatabaseFormulaProperty[],
      propertyValuesByKey: Object.fromEntries(
        Object.entries(context.propertyValues).map(([propertyId, value]) => [
          `${row?.pageId ?? "scheduled"}:${propertyId}`,
          formulaPropertyValue(value),
        ]),
      ),
      row: {
        createdAt: row?.createdAt.toISOString() ?? context.run.triggerTime.toISOString(),
        id: row?.id ?? `scheduled:${context.run.id}`,
        page: {
          createdAt: row?.pageCreatedAt.toISOString() ?? context.run.triggerTime.toISOString(),
          name: row?.title ?? "Scheduled automation",
          updatedAt: row?.pageUpdatedAt.toISOString() ?? context.run.triggerTime.toISOString(),
        },
        pageId: row?.pageId ?? `scheduled:${context.run.id}`,
        updatedAt: row?.updatedAt.toISOString() ?? context.run.triggerTime.toISOString(),
      },
      timezone: context.definition.timezone,
      titlePropertyLabel: "Name",
      variables: context.variables,
    });
    if (!result.ok) throw new AutomationActionError(result.error, "AUTOMATION_FORMULA_FAILED");
    return result.value;
  }
  switch (expression.reference) {
    case "trigger_page": return requireTriggerRow(context).pageId;
    case "trigger_property": return context.propertyValues[expression.propertyId] ?? null;
    case "trigger_person": return context.run.triggerActorId;
    case "page_creator": return requireTriggerRow(context).createdById;
    case "page_last_editor": return requireTriggerRow(context).lastEditedById;
    case "now": return context.run.triggerTime.toISOString();
    case "today": return zonedDate(context.run.triggerTime, context.definition.timezone);
    case "variable": return context.variables[expression.name] ?? null;
    case "action_output": return context.actionOutputs[expression.actionId]?.[expression.output] ?? null;
    case "selected_person": return expression.userId;
    case "selected_page": return expression.pageId;
    case "selected_group": return expression.groupId;
    case "selected_teamspace": return expression.teamspaceId;
  }
}

function resolveOperations(
  context: ExecutionContext,
  operations: Array<{ mode: "add" | "clear" | "remove" | "set"; propertyId: string; value?: AutomationValueExpression }>,
): ResolvedAutomationPropertyOperation[] {
  return operations.map((operation) => ({
    mode: operation.mode,
    propertyId: operation.propertyId,
    ...(operation.value ? { value: resolveExpression(context, operation.value) } : {}),
  }));
}

async function resolveEditTarget(
  context: ExecutionContext,
  action: Extract<DatabaseAutomationAction, { type: "edit_pages" }>,
) {
  if (action.target.type === "variable_pages") {
    const pageIds = stringList(context.variables[action.target.variableName]);
    return {
      dataSourceId: context.run.dataSourceId,
      rows: await rowsForPages(context.run.dataSourceId, pageIds),
    };
  }
  if (action.target.type === "related_pages") {
    requireTriggerRow(context);
    const target = action.target;
    const property = context.properties.find(
      (candidate) => candidate.property.id === target.propertyId,
    );
    const dataSourceId = relatedDataSourceId(property?.property.config);
    if (!dataSourceId) throw new AutomationActionError("Relation target is unavailable", "AUTOMATION_TARGET_INVALID");
    return {
      dataSourceId,
      rows: await rowsForPages(dataSourceId, stringList(context.propertyValues[target.propertyId])),
    };
  }
  const rows = await loadFilterTargetRows(
    action.target.dataSourceId,
    action.target.filter,
    context.definition,
    context.run.triggerTime,
  );
  return { dataSourceId: action.target.dataSourceId, rows };
}

function requireTriggerRow(context: Pick<ExecutionContext, "row">) {
  if (!context.row) {
    throw new AutomationActionError(
      "Scheduled automations have no trigger page",
      "AUTOMATION_TRIGGER_MISSING",
    );
  }
  return context.row;
}

async function loadFilterTargetRows(
  dataSourceId: string,
  filter: AutomationFilterDefinition,
  definition: DatabaseAutomationDefinition,
  now = new Date(),
) {
  const [rows, properties] = await Promise.all([
    db
      .select({ pageId: databaseRow.pageId, rowId: databaseRow.id, title: page.name })
      .from(databaseRow)
      .innerJoin(page, eq(page.id, databaseRow.pageId))
      .where(and(eq(databaseRow.dataSourceId, dataSourceId), isNull(databaseRow.deletedAt), isNull(page.deletedAt)))
      .orderBy(asc(databaseRow.position))
      .limit(1_001),
    loadProperties(dataSourceId),
  ]);
  if (rows.length > 1_000) throw new AutomationActionError("Edit-pages target exceeds 1,000 rows", "AUTOMATION_ROW_LIMIT");
  const values = rows.length
    ? await db
        .select({ pageId: pagePropertyValue.pageId, propertyId: pagePropertyValue.propertyId, value: pagePropertyValue.value })
        .from(pagePropertyValue)
        .where(inArray(pagePropertyValue.pageId, rows.map((row) => row.pageId)))
    : [];
  const propertyMap = new Map(properties.map((property) => [property.property.id, {
    config: property.property.config,
    id: property.property.id,
    type: property.property.type,
  }]));
  return rows
    .filter((row) => matchesAutomationFilterDefinition(filter, {
      afterValues: {
        ...Object.fromEntries(values.filter((value) => value.pageId === row.pageId).map((value) => [value.propertyId, value.value])),
        name: row.title,
      },
      changedPropertyIds: [],
      now,
      properties: propertyMap,
      rowAdded: false,
      timezone: definition.timezone,
    }))
    .map(({ pageId, rowId }) => ({ pageId, rowId }));
}

async function rowsForPages(dataSourceId: string, pageIds: string[]) {
  if (pageIds.length > 1_000) throw new AutomationActionError("Edit-pages target exceeds 1,000 rows", "AUTOMATION_ROW_LIMIT");
  if (!pageIds.length) return [];
  return db
    .select({ pageId: databaseRow.pageId, rowId: databaseRow.id })
    .from(databaseRow)
    .where(
      and(
        eq(databaseRow.dataSourceId, dataSourceId),
        inArray(databaseRow.pageId, pageIds),
        isNull(databaseRow.deletedAt),
      ),
    );
}

async function loadProperties(dataSourceId: string) {
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

function restoreStepOutput(
  context: Pick<ExecutionContext, "actionOutputs" | "variables">,
  actionId: string,
  output: unknown,
) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return;
  const record = output as Record<string, unknown>;
  context.actionOutputs[actionId] = record;
  if (record.variables && typeof record.variables === "object" && !Array.isArray(record.variables)) {
    Object.assign(context.variables, record.variables);
  }
}

function assertBoundedValue(value: unknown) {
  if (Array.isArray(value) && value.length > 1_000) {
    throw new AutomationActionError("Variable list exceeds 1,000 items", "AUTOMATION_VARIABLE_LIMIT");
  }
  if (JSON.stringify(toJson(value)).length > 65_536) {
    throw new AutomationActionError("Variable exceeds 64 KiB", "AUTOMATION_VARIABLE_LIMIT");
  }
}

function toJson(value: unknown): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toJson(item)]));
  }
  return value ?? null;
}

const stableActionSuffix = (runId: string, actionId: string) =>
  createHash("sha256").update(`${runId}:${actionId}`).digest("hex").slice(0, 32);

const requireOwner = (ownerUserId: string | null) => {
  if (!ownerUserId) throw new AutomationActionError("Automation owner is unavailable", "AUTOMATION_OWNER_REVOKED");
  return ownerUserId;
};

const stringList = (value: unknown) =>
  (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string");

function relatedDataSourceId(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const relation = (config as { relation?: unknown }).relation;
  if (!relation || typeof relation !== "object" || Array.isArray(relation)) return null;
  const id = (relation as { relatedDataSourceId?: unknown }).relatedDataSourceId;
  return typeof id === "string" ? id : null;
}

function actionFailure(error: unknown, actionId: string | null = null) {
  if (error instanceof AutomationActionError) {
    return new AutomationActionError(error.message, error.code, error.actionId ?? actionId);
  }
  return new AutomationActionError(
    error instanceof Error ? error.message.slice(0, 2_000) : "Automation action failed",
    "AUTOMATION_ACTION_FAILED",
    actionId,
  );
}

async function failClaimedRun(
  runId: string,
  workerId: string,
  failure: AutomationActionError,
  knownAutomationId?: string,
) {
  const automationId = knownAutomationId ?? (await db
    .select({ automationId: databaseAutomationRun.automationId })
    .from(databaseAutomationRun)
    .where(
      and(
        eq(databaseAutomationRun.id, runId),
        eq(databaseAutomationRun.leaseOwner, workerId),
      ),
    )
    .limit(1))[0]?.automationId;
  if (!automationId) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(databaseAutomationRun)
      .set({
        errorCode: failure.code,
        errorSummary: failure.message,
        finishedAt: now,
        leaseExpiresAt: null,
        leaseOwner: null,
        status: "failed",
        updatedAt: now,
      })
      .where(
        and(
          eq(databaseAutomationRun.id, runId),
          eq(databaseAutomationRun.leaseOwner, workerId),
        ),
      );
    await tx
      .update(databaseAutomation)
      .set({
        errorActionId: failure.actionId,
        errorCode: failure.code,
        errorSummary: failure.message,
        erroredAt: now,
        lastRunAt: now,
        lastRunStatus: "failed",
        nextRunAt: null,
        status: "error",
        updatedAt: now,
      })
      .where(eq(databaseAutomation.id, automationId));
  });
}

async function skipClaimedRun(runId: string, workerId: string, skipReason: string) {
  const now = new Date();
  await db
    .update(databaseAutomationRun)
    .set({
      finishedAt: now,
      leaseExpiresAt: null,
      leaseOwner: null,
      skipReason,
      status: "skipped",
      updatedAt: now,
    })
    .where(
      and(
        eq(databaseAutomationRun.id, runId),
        eq(databaseAutomationRun.leaseOwner, workerId),
      ),
    );
}

function formulaPropertyValue(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalized = formulaPropertyValue(item);
      return Array.isArray(normalized) ? normalized : [normalized];
    });
  }
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (["boolean", "number", "string"].includes(typeof value)) return String(value);
  return JSON.stringify(value);
}

function zonedDate(value: Date, timezone: string) {
  const parts = getZonedDateParts(value, timezone);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
