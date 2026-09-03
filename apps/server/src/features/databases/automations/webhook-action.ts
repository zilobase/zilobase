import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type DatabaseAutomationAction } from "@zilobase/features/databases/automations";
import { getAutomationWebhookHttpDomains, isAutomationWebhooksEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { isSelfHostedRuntime } from "../../../infrastructure/runtime/runtime-adapter";
import { db } from "../../../infrastructure/database";
import { databaseAutomationDelivery, automationSecret, page } from "../../../infrastructure/database/schema";
import { decryptAutomationSecret } from "./secret-crypto";
import { sendPinnedWebhook, validateWebhookHeaderName, WebhookEgressError } from "./webhook-egress";
import { AutomationActionError } from "./action-error";
import { type ExecutionContext } from "./execution-context";
import { resolveExpression, toJson, requireOwner } from "./action-support";
export async function executeWebhookAction(
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
