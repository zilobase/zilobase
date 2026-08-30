import { and, eq, sql } from "drizzle-orm"

import { db, runWithDbEnv } from "../../infrastructure/database"
import { gmailConnection } from "../../infrastructure/database/schema"
import { getStringEnv, type RuntimeEnv } from "../../shared/config/config"
import { publishMailNotification } from "../../infrastructure/runtime/runtime-adapter"
import { verifyGoogleOidcToken } from "./security/google-oidc-token"

const MAX_PUSH_BYTES = 64 * 1024

export async function processGmailPubsubRequest(
  env: RuntimeEnv,
  request: Request,
  fetcher: typeof fetch = fetch,
) {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_PUSH_BYTES) throw new GmailPushError("Push payload is too large.", 413)
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1]
  if (!token) throw new GmailPushError("Push authentication is required.", 401)
  const config = pubsubConfig(env)
  try {
    await verifyGoogleOidcToken(token, {
      audience: config.audience,
      email: config.serviceAccountEmail,
    }, fetcher)
  } catch {
    throw new GmailPushError("Push authentication failed.", 401)
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_PUSH_BYTES) {
    throw new GmailPushError("Push payload is too large.", 413)
  }
  const notification = parsePubsubEnvelope(text, config.subscription)
  return runWithDbEnv(env, async () => {
    const updated = await db
      .update(gmailConnection)
      .set({
        mailboxRevision: sql`${gmailConnection.mailboxRevision} + 1`,
        notificationHistoryId: notification.historyId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(gmailConnection.email, notification.emailAddress),
        eq(gmailConnection.status, "connected"),
        sql`(${gmailConnection.notificationHistoryId} is null or ${gmailConnection.notificationHistoryId}::numeric < ${notification.historyId}::numeric)`,
      ))
      .returning({ connectionId: gmailConnection.id, revision: gmailConnection.mailboxRevision, userId: gmailConnection.userId })
    const event = updated[0] ?? null
    if (event) await publishMailNotification(env, event)
    return event
  })
}

export function parsePubsubEnvelope(text: string, expectedSubscription: string) {
  let envelope: { message?: { data?: string; messageId?: string }; subscription?: string }
  try {
    envelope = JSON.parse(text) as typeof envelope
  } catch {
    throw new GmailPushError("Push payload is invalid.", 400)
  }
  if (envelope.subscription !== expectedSubscription || !envelope.message?.messageId) {
    throw new GmailPushError("Push subscription is invalid.", 403)
  }
  return decodeNotification(envelope.message.data)
}

export function decodeNotification(data: string | undefined) {
  if (!data || data.length > MAX_PUSH_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new GmailPushError("Push message data is invalid.", 400)
  }
  try {
    const decoded = JSON.parse(atob(data)) as { emailAddress?: unknown; historyId?: unknown }
    const emailAddress = typeof decoded.emailAddress === "string" ? decoded.emailAddress.trim().toLowerCase() : ""
    const historyId = typeof decoded.historyId === "string" ? decoded.historyId : ""
    if (!/^[^\s@]+@[^\s@]+$/.test(emailAddress) || !/^\d{1,32}$/.test(historyId)) throw new Error()
    return { emailAddress, historyId }
  } catch {
    throw new GmailPushError("Push message data is invalid.", 400)
  }
}

function pubsubConfig(env: RuntimeEnv) {
  const audience = getStringEnv(env, "GMAIL_PUBSUB_PUSH_AUDIENCE")?.trim()
  const serviceAccountEmail = getStringEnv(env, "GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL")?.trim().toLowerCase()
  const subscription = getStringEnv(env, "GMAIL_PUBSUB_SUBSCRIPTION")?.trim()
  if (!audience || !serviceAccountEmail || !subscription) {
    throw new GmailPushError("Gmail push is not configured.", 503)
  }
  return { audience, serviceAccountEmail, subscription }
}

export class GmailPushError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "GmailPushError"
  }
}
