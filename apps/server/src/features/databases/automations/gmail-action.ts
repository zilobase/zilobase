import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type AutomationValueExpression, type DatabaseAutomationAction } from "@zilobase/features/databases/automations";
import { isMailFeatureEnabled, type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { databaseAutomationDelivery, gmailAccount, gmailWorkspaceConnection, member, user } from "../../../infrastructure/database/schema";
import { invalidateDatabaseAutomationDependencies } from "./service";
import { createGmailGateway, clearGmailAccessTokenCache, GmailApiError } from "../../mail/gmail-gateway";
import { sendGmailComposition } from "../../mail/mail-compose";
import { parseMailComposeRequest } from "../../mail/mail-mime";
import { withMailUserConcurrency } from "../../mail/user-concurrency";
import { AutomationActionError, RetryableAutomationActionError } from "./action-error";
import { type ExecutionContext } from "./execution-context";
import { resolveRichText, scalarString, userIds, resolveExpression, requireOwner } from "./action-support";
import { measureBackgroundProvider } from "../../../infrastructure/background/telemetry";
export async function executeGmailAction(
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
  if (receipt?.status === "retrying" && receipt.nextAttemptAt && receipt.nextAttemptAt > now) {
    throw new RetryableAutomationActionError(
      receipt.errorSummary ?? "Gmail delivery is waiting to retry",
      receipt.errorCode ?? "AUTOMATION_GMAIL_RETRY",
      receipt.nextAttemptAt,
    );
  }
  const attempt = (receipt?.attempts ?? 0) + 1;
  await db
    .update(databaseAutomationDelivery)
    .set({ attempts: sql`${databaseAutomationDelivery.attempts} + 1`, status: "sending", updatedAt: new Date() })
    .where(eq(databaseAutomationDelivery.deliveryId, deliveryId));

  try {
    const result = await measureBackgroundProvider(env, "automation.run", () =>
      withMailUserConcurrency(ownerUserId, async () => {
        const gateway = await createGmailGateway(env, owned.connection);
        return sendGmailComposition({ compose, connection: owned.connection, gateway, userId: ownerUserId });
      })
    );
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
    if (error instanceof GmailApiError && error.retryable && attempt < 3) {
      const delay = Math.min(
        error.retryAfterMs ?? (error.code === "quota_exceeded" ? 60_000 : 1_000 * 2 ** (attempt - 1)),
        15 * 60_000,
      );
      const nextAttemptAt = new Date(Date.now() + delay);
      await db.update(databaseAutomationDelivery).set({
        errorCode: code,
        errorSummary: error.message.slice(0, 2_000),
        nextAttemptAt,
        status: "retrying",
        updatedAt: new Date(),
      }).where(eq(databaseAutomationDelivery.deliveryId, deliveryId));
      throw new RetryableAutomationActionError(error.message, code, nextAttemptAt);
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
