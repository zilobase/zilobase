import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { type DatabaseAutomationAction } from "@zilobase/features/databases/automations";
import { isAutomationSlackEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { databaseAutomationDelivery, slackConnection } from "../../../infrastructure/database/schema";
import { invalidateDatabaseAutomationDependencies } from "./service";
import { listSlackChannels, sendSlackMessage, SlackProviderError } from "./slack-provider";
import { AutomationActionError, RetryableAutomationActionError } from "./action-error";
import { type ExecutionContext } from "./execution-context";
import { displayValue, resolveExpression, requireOwner } from "./action-support";
import { measureBackgroundProvider } from "../../../infrastructure/background/telemetry";
export async function executeSlackAction(
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
    if (part.type === "text") {
      let formatted = escapeSlack(part.text);
      if (part.bold) formatted = `*${formatted}*`;
      if (part.italic) formatted = `_${formatted}_`;
      return formatted;
    }
    if (part.type === "value") return escapeSlack(displayValue(resolveExpression(context, part.value)));
    if (part.type === "slack_mention") return part.kind === "user" ? `<@${part.id}>` : `<#${part.id}>`;
    if (part.type === "slack_broadcast") return `<!${part.kind}>`;
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
  if (receipt?.status === "retrying" && receipt.nextAttemptAt && receipt.nextAttemptAt > now) {
    throw new RetryableAutomationActionError(
      receipt.errorSummary ?? "Slack delivery is waiting to retry",
      receipt.errorCode ?? "SLACK_RETRY",
      receipt.nextAttemptAt,
    );
  }
  const attempt = (receipt?.attempts ?? 0) + 1;
  await db.update(databaseAutomationDelivery).set({
    attempts: sql`${databaseAutomationDelivery.attempts} + 1`, nextAttemptAt: null, status: "sending", updatedAt: new Date(),
  }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
  try {
    const authorizedChannels = await measureBackgroundProvider(
      env,
      "automation.run",
      () => listSlackChannels(env, connection),
    );
    if (!authorizedChannels.some(({ id }) => id === action.channelId)) {
      throw new SlackProviderError("Slack channel is unavailable or is a direct message", "SLACK_CHANNEL_UNAVAILABLE", 409);
    }
    const result = await measureBackgroundProvider(env, "automation.run", () =>
      sendSlackMessage(env, connection, { channelId: action.channelId, deliveryId, text })
    );
    await db.update(databaseAutomationDelivery).set({
      errorCode: null, errorSummary: null, providerReference: result.messageTs,
      status: "succeeded", updatedAt: new Date(),
    }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
    return { deliveryId, messageTs: result.messageTs, reused: false };
  } catch (error) {
    if (error instanceof SlackProviderError && error.code === "SLACK_CONNECTION_REVOKED") await markSlackConnectionRevoked(connection.id, error);
    const failure = error instanceof SlackProviderError ? error : new SlackProviderError("Slack delivery failed", "SLACK_DELIVERY_FAILED", 502, true);
    if (failure.retryable && attempt < 4) {
      const jitter = Number.parseInt(suffix.slice(attempt * 2, attempt * 2 + 2), 16) % 100;
      const delay = Math.min(failure.retryAfterMs ?? 1_000 * 2 ** (attempt - 1) + jitter, 15 * 60_000);
      const nextAttemptAt = new Date(Date.now() + delay);
      await db.update(databaseAutomationDelivery).set({
        errorCode: failure.code, errorSummary: failure.message.slice(0, 2_000), nextAttemptAt,
        status: "retrying", updatedAt: new Date(),
      }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
      throw new RetryableAutomationActionError(failure.message, failure.code, nextAttemptAt);
    }
  await db.update(databaseAutomationDelivery).set({
    errorCode: failure.code, errorSummary: failure.message.slice(0, 2_000), nextAttemptAt: null,
    status: "failed", updatedAt: new Date(),
  }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
  throw new AutomationActionError(failure.message, failure.code);
  }
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
