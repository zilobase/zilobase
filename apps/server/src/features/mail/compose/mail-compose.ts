import { sha256Hex } from "../../../shared/crypto/sha256";
import { and, eq, lt, inArray } from "drizzle-orm";
import type {
  MailComposeRequest,
  MailDraftResponse,
  MailMessageRecord,
  MailSendResponse,
} from "@zilobase/features/mail/contracts";

import { db } from "../../../infrastructure/database";
import { gmailSendOperation } from "../../../infrastructure/database/schema";
import {
  GmailApiError,
  type GmailConnectionRow,
  type GmailDraft,
  type GmailGateway,
  type GmailMessage,
} from "../provider/gmail-gateway";
import { normalizeGmailMessage } from "../provider/mail-normalize";
import { buildMailMime } from "./mail-mime";

const SEND_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export async function createGmailDraft(
  gateway: GmailGateway,
  connection: GmailConnectionRow,
  input: MailComposeRequest,
): Promise<MailDraftResponse> {
  const mime = buildMailMime(input, connection.email);
  const draft = await gateway.createDraft({ message: mailResource(mime.raw, input.threadId) });
  return normalizeDraft(await requireDraft(gateway, draft));
}

export async function updateGmailDraft(
  gateway: GmailGateway,
  connection: GmailConnectionRow,
  draftId: string,
  input: MailComposeRequest,
): Promise<MailDraftResponse> {
  const mime = buildMailMime(input, connection.email);
  const draft = await gateway.updateDraft(draftId, {
    message: mailResource(mime.raw, input.threadId),
  });
  return normalizeDraft(await requireDraft(gateway, draft, draftId));
}

export async function sendGmailComposition(input: {
  compose: MailComposeRequest;
  connection: GmailConnectionRow;
  draftId?: string;
  gateway: GmailGateway;
  userId: string;
}): Promise<MailSendResponse> {
  const mime = buildMailMime(input.compose, input.connection.email);
  const { operation, created } = await reserveSendOperation(input, mime.rfcMessageId);

  const previous = await recoverSentMessage(
    input.gateway,
    operation.rfcMessageId,
    operation.gmailMessageId,
  );
  if (previous) {
    return await completeSend(input.gateway, operation.id, previous.id!, true);
  }
  if (!created && !(await claimRetry(operation))) {
    throw new GmailApiError(
      "This message is still being sent. Retry shortly.",
      409,
      "provider_error",
      true,
    );
  }

  let deliveryStarted = false;
  try {
    if (input.draftId)
      await updateGmailDraft(input.gateway, input.connection, input.draftId, input.compose);
    deliveryStarted = true;
    const sent = input.draftId
      ? await input.gateway.sendDraft(input.draftId)
      : await input.gateway.sendMessage(mailResource(mime.raw, input.compose.threadId));
    const id = requireMessageId(sent);
    return await completeSend(input.gateway, operation.id, id, false);
  } catch (error) {
    if (deliveryStarted && isAmbiguousSendFailure(error)) {
      const recovered = await recoverSentMessage(input.gateway, operation.rfcMessageId);
      if (recovered) {
        return await completeSend(input.gateway, operation.id, recovered.id!, true);
      }
      await markOperation(operation.id, "ambiguous");
    } else await markOperation(operation.id, "failed");
    throw error;
  }
}

export async function cleanupExpiredGmailSendOperations(now = new Date()) {
  const expired = await db
    .select({ id: gmailSendOperation.id })
    .from(gmailSendOperation)
    .where(
      and(
        lt(gmailSendOperation.expiresAt, now),
        inArray(gmailSendOperation.status, ["sent", "failed"]),
      ),
    )
    .limit(500);
  if (expired.length)
    await db.delete(gmailSendOperation).where(
      inArray(
        gmailSendOperation.id,
        expired.map((row) => row.id),
      ),
    );
}

async function requireDraft(gateway: GmailGateway, draft: GmailDraft, fallbackId?: string) {
  const id = draft.id ?? fallbackId;
  if (!id) throw new GmailApiError("Gmail returned a draft without an ID.", 502, "provider_error");
  return draft.message?.payload ? { ...draft, id } : gateway.getDraft(id);
}

export function normalizeDraft(draft: GmailDraft): MailDraftResponse {
  if (!draft.id || !draft.message)
    throw new GmailApiError("Gmail returned an invalid draft.", 502, "provider_error");
  return {
    draftId: draft.id,
    message: { ...normalizeGmailMessage(draft.message, true), draftId: draft.id },
  };
}

async function recoverSentMessage(
  gateway: GmailGateway,
  rfcMessageId: string,
  knownGmailId?: string | null,
) {
  if (knownGmailId) return { id: knownGmailId } satisfies GmailMessage;
  const result = await gateway.listMessages({
    maxResults: 1,
    query: `in:sent rfc822msgid:${rfcMessageId}`,
  });
  return result.messages?.find((message) => message.id) ?? null;
}

function mailResource(raw: string, threadId?: string) {
  return { raw, ...(threadId ? { threadId } : {}) };
}

function requireMessageId(message: GmailMessage) {
  if (!message.id)
    throw new GmailApiError(
      "Gmail returned a sent message without an ID.",
      502,
      "provider_error",
      true,
    );
  return message.id;
}

function isAmbiguousSendFailure(error: unknown) {
  return !(error instanceof GmailApiError) || error.retryable || error.status >= 500;
}

function findOperation(id: string) {
  return db
    .select()
    .from(gmailSendOperation)
    .where(eq(gmailSendOperation.id, id))
    .limit(1)
    .then(([row]) => row);
}

function markOperationSent(id: string, gmailMessageId: string) {
  return db
    .update(gmailSendOperation)
    .set({ gmailMessageId, status: "sent", updatedAt: new Date() })
    .where(eq(gmailSendOperation.id, id));
}

function markOperation(id: string, status: "ambiguous" | "failed") {
  return db
    .update(gmailSendOperation)
    .set({ status, updatedAt: new Date() })
    .where(eq(gmailSendOperation.id, id));
}

async function claimRetry(operation: typeof gmailSendOperation.$inferSelect) {
  // A pending process may have died after Google accepted delivery. Never replay it.
  if (operation.status !== "failed" || !operation.compositionHash) return false;
  const conditions = [
    eq(gmailSendOperation.id, operation.id),
    eq(gmailSendOperation.status, "failed"),
  ];
  const claimed = await db
    .update(gmailSendOperation)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: gmailSendOperation.id });
  return claimed.length > 0;
}

async function reserveSendOperation(
  input: {
    compose: MailComposeRequest;
    connection: GmailConnectionRow;
    userId: string;
    draftId?: string;
  },
  rfcMessageId: string,
) {
  const compositionHash = await sha256Hex(
    JSON.stringify({ ...input.compose, draftId: undefined, clientOperationId: undefined }),
  );
  let operation = await findOperation(input.compose.clientOperationId);
  let created = false;
  if (
    operation &&
    (operation.userId !== input.userId || operation.connectionId !== input.connection.id)
  ) {
    throw new GmailApiError("The mail operation ID is already in use.", 409, "provider_error");
  }
  if (operation?.rfcMessageId !== undefined && operation.rfcMessageId !== rfcMessageId) {
    throw new GmailApiError(
      "The mail operation cannot be changed after sending starts.",
      409,
      "provider_error",
    );
  }
  if (!operation) {
    const now = new Date();
    const inserted = await db
      .insert(gmailSendOperation)
      .values({
        connectionId: input.connection.id,
        compositionHash,
        draftId: input.draftId ?? null,
        expiresAt: new Date(now.getTime() + SEND_RECEIPT_TTL_MS),
        id: input.compose.clientOperationId,
        rfcMessageId: rfcMessageId,
        status: "pending",
        userId: input.userId,
      })
      .onConflictDoNothing()
      .returning({ id: gmailSendOperation.id });
    created = inserted.length > 0;
    operation = await findOperation(input.compose.clientOperationId);
    if (
      !operation ||
      operation.userId !== input.userId ||
      operation.connectionId !== input.connection.id
    ) {
      throw new GmailApiError("The mail operation ID is already in use.", 409, "provider_error");
    }
  }

  if (
    operation.compositionHash &&
    (operation.compositionHash !== compositionHash || operation.draftId !== (input.draftId ?? null))
  ) {
    throw new GmailApiError(
      "The mail operation cannot be changed after sending starts.",
      409,
      "provider_error",
    );
  }
  return { operation, created };
}

async function completeSend(
  gateway: GmailGateway,
  operationId: string,
  messageId: string,
  reused: boolean,
): Promise<MailSendResponse> {
  await markOperationSent(operationId, messageId);
  let message: MailMessageRecord | null = null;
  try {
    message = normalizeGmailMessage(await gateway.getMessage(messageId, "full"), true);
  } catch {
    /* Delivery is durable; clients can hydrate through ordinary synchronization. */
  }
  return { message, messageId, reused };
}
