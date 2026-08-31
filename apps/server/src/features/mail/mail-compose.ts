import { and, eq, lt } from "drizzle-orm"
import type {
  MailComposeRequest,
  MailDraftResponse,
  MailMessageRecord,
  MailSendResponse,
} from "@zilobase/features/mail"

import { db } from "../../infrastructure/database"
import { gmailSendOperation } from "../../infrastructure/database/schema"
import { GmailApiError, type GmailConnectionRow, type GmailDraft, type GmailGateway, type GmailMessage } from "./gmail-gateway"
import { normalizeGmailMessage } from "./mail-normalize"
import { buildMailMime } from "./mail-mime"

const SEND_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1_000

export async function createGmailDraft(
  gateway: GmailGateway,
  connection: GmailConnectionRow,
  input: MailComposeRequest,
): Promise<MailDraftResponse> {
  const mime = buildMailMime(input, connection.email)
  const draft = await gateway.createDraft({ message: mailResource(mime.raw, input.threadId) })
  return normalizeDraft(await requireDraft(gateway, draft))
}

export async function updateGmailDraft(
  gateway: GmailGateway,
  connection: GmailConnectionRow,
  draftId: string,
  input: MailComposeRequest,
): Promise<MailDraftResponse> {
  const mime = buildMailMime(input, connection.email)
  const draft = await gateway.updateDraft(draftId, { message: mailResource(mime.raw, input.threadId) })
  return normalizeDraft(await requireDraft(gateway, draft, draftId))
}

export async function sendGmailComposition(input: {
  compose: MailComposeRequest
  connection: GmailConnectionRow
  draftId?: string
  gateway: GmailGateway
  userId: string
}): Promise<MailSendResponse> {
  await cleanupExpiredGmailSendOperations()
  const mime = buildMailMime(input.compose, input.connection.email)
  let operation = await findOperation(input.compose.clientOperationId)
  let created = false
  if (operation && (operation.userId !== input.userId || operation.connectionId !== input.connection.id)) {
    throw new GmailApiError("The mail operation ID is already in use.", 409, "provider_error")
  }
  if (operation?.rfcMessageId !== undefined && operation.rfcMessageId !== mime.rfcMessageId) {
    throw new GmailApiError("The mail operation cannot be changed after sending starts.", 409, "provider_error")
  }
  if (!operation) {
    const now = new Date()
    const inserted = await db.insert(gmailSendOperation).values({
      connectionId: input.connection.id,
      expiresAt: new Date(now.getTime() + SEND_RECEIPT_TTL_MS),
      id: input.compose.clientOperationId,
      rfcMessageId: mime.rfcMessageId,
      status: "pending",
      userId: input.userId,
    }).onConflictDoNothing().returning({ id: gmailSendOperation.id })
    created = inserted.length > 0
    operation = await findOperation(input.compose.clientOperationId)
    if (!operation || operation.userId !== input.userId || operation.connectionId !== input.connection.id) {
      throw new GmailApiError("The mail operation ID is already in use.", 409, "provider_error")
    }
  }

  const previous = await recoverSentMessage(input.gateway, operation.rfcMessageId, operation.gmailMessageId)
  if (previous) {
    await markOperationSent(operation.id, previous.id!)
    return { message: normalizeGmailMessage(await input.gateway.getMessage(previous.id!, "full"), true), reused: true }
  }
  if (!created && !await claimRetry(operation)) {
    throw new GmailApiError("This message is still being sent. Retry shortly.", 409, "provider_error", true)
  }

  try {
    const sent = input.draftId
      ? await input.gateway.sendDraft(input.draftId)
      : await input.gateway.sendMessage(mailResource(mime.raw, input.compose.threadId))
    const id = requireMessageId(sent)
    await markOperationSent(operation.id, id)
    return { message: normalizeGmailMessage(await input.gateway.getMessage(id, "full"), true), reused: false }
  } catch (error) {
    if (isAmbiguousSendFailure(error)) {
      const recovered = await recoverSentMessage(input.gateway, operation.rfcMessageId)
      if (recovered) {
        await markOperationSent(operation.id, recovered.id!)
        return { message: normalizeGmailMessage(await input.gateway.getMessage(recovered.id!, "full"), true), reused: true }
      }
      await markOperation(operation.id, "ambiguous")
    } else await markOperation(operation.id, "failed")
    throw error
  }
}

export async function cleanupExpiredGmailSendOperations(now = new Date()) {
  return db.delete(gmailSendOperation).where(lt(gmailSendOperation.expiresAt, now))
}

async function requireDraft(gateway: GmailGateway, draft: GmailDraft, fallbackId?: string) {
  const id = draft.id ?? fallbackId
  if (!id) throw new GmailApiError("Gmail returned a draft without an ID.", 502, "provider_error")
  return draft.message?.payload ? { ...draft, id } : gateway.getDraft(id)
}

function normalizeDraft(draft: GmailDraft): MailDraftResponse {
  if (!draft.id || !draft.message) throw new GmailApiError("Gmail returned an invalid draft.", 502, "provider_error")
  return {
    draftId: draft.id,
    message: { ...normalizeGmailMessage(draft.message, true), draftId: draft.id },
  }
}

async function recoverSentMessage(gateway: GmailGateway, rfcMessageId: string, knownGmailId?: string | null) {
  if (knownGmailId) return { id: knownGmailId } satisfies GmailMessage
  const result = await gateway.listMessages({ maxResults: 1, query: `in:sent rfc822msgid:${rfcMessageId}` })
  return result.messages?.find((message) => message.id) ?? null
}

function mailResource(raw: string, threadId?: string) {
  return { raw, ...(threadId ? { threadId } : {}) }
}

function requireMessageId(message: GmailMessage) {
  if (!message.id) throw new GmailApiError("Gmail returned a sent message without an ID.", 502, "provider_error", true)
  return message.id
}

function isAmbiguousSendFailure(error: unknown) {
  return error instanceof GmailApiError && error.retryable
}

function findOperation(id: string) {
  return db.select().from(gmailSendOperation).where(eq(gmailSendOperation.id, id)).limit(1).then(([row]) => row)
}

function markOperationSent(id: string, gmailMessageId: string) {
  return db.update(gmailSendOperation).set({ gmailMessageId, status: "sent", updatedAt: new Date() })
    .where(eq(gmailSendOperation.id, id))
}

function markOperation(id: string, status: "ambiguous" | "failed") {
  return db.update(gmailSendOperation).set({ status, updatedAt: new Date() }).where(eq(gmailSendOperation.id, id))
}

async function claimRetry(operation: typeof gmailSendOperation.$inferSelect) {
  if (operation.status !== "ambiguous" && operation.status !== "failed" && operation.status !== "pending") return false
  const staleBefore = new Date(Date.now() - 2 * 60 * 1_000)
  if (operation.status === "pending" && operation.updatedAt >= staleBefore) return false
  const conditions = [eq(gmailSendOperation.id, operation.id), eq(gmailSendOperation.status, operation.status)]
  if (operation.status === "pending") conditions.push(lt(gmailSendOperation.updatedAt, staleBefore))
  const claimed = await db.update(gmailSendOperation)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: gmailSendOperation.id })
  return claimed.length > 0
}
