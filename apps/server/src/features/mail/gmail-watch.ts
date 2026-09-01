import { and, eq, isNull, lt, or } from "drizzle-orm"

import { db } from "../../infrastructure/database"
import { gmailAccount } from "../../infrastructure/database/schema"
import { getStringEnv, isMailFeatureEnabled, type RuntimeEnv } from "../../shared/config/config"
import { createGmailGateway, GmailApiError } from "./gmail-gateway"
import { recordMailMetric } from "./mail-metrics"

const RENEW_BEFORE_MS = 24 * 60 * 60 * 1_000
const RENEW_LOCK_MS = 10 * 60 * 1_000

export async function initializeGmailWatch(
  env: RuntimeEnv,
  connection: typeof gmailAccount.$inferSelect,
) {
  const topicName = gmailPubsubTopic(env)
  if (!topicName) return null
  const gateway = await createGmailGateway(env, connection)
  const result = await gateway.watch(topicName)
  if (!result.historyId || !result.expiration) throw new Error("Gmail returned an invalid watch response.")
  const expiration = new Date(Number(result.expiration))
  if (!Number.isFinite(expiration.getTime())) throw new Error("Gmail returned an invalid watch expiration.")
  await db
    .update(gmailAccount)
    .set({
      lastErrorCode: null,
      lastWatchAt: new Date(),
      notificationHistoryId: connection.notificationHistoryId ?? result.historyId,
      updatedAt: new Date(),
      watchExpiresAt: expiration,
    })
    .where(eq(gmailAccount.id, connection.id))
  await recordMailMetric("watch_health", { connectionId: connection.id, outcome: "success" })
  return { expiration, historyId: result.historyId }
}

export async function renewGmailWatches(env: RuntimeEnv, limit = 25) {
  if (!isMailFeatureEnabled(env)) return { failed: 0, renewed: 0 }
  if (!gmailPubsubTopic(env)) return { failed: 0, renewed: 0 }
  const now = new Date()
  const horizon = new Date(now.getTime() + RENEW_BEFORE_MS)
  const lockExpiry = new Date(now.getTime() - RENEW_LOCK_MS)
  const candidates = await db
    .select()
    .from(gmailAccount)
    .where(and(
      eq(gmailAccount.status, "connected"),
      or(isNull(gmailAccount.watchExpiresAt), lt(gmailAccount.watchExpiresAt, horizon)),
      or(isNull(gmailAccount.lastWatchAt), lt(gmailAccount.lastWatchAt, lockExpiry)),
    ))
    .limit(Math.max(1, Math.min(limit, 100)))
  let renewed = 0
  let failed = 0
  for (const candidate of candidates) {
    const claimed = await db
      .update(gmailAccount)
      .set({ lastWatchAt: now, updatedAt: now })
      .where(and(
        eq(gmailAccount.id, candidate.id),
        or(isNull(gmailAccount.lastWatchAt), lt(gmailAccount.lastWatchAt, lockExpiry)),
      ))
      .returning({ id: gmailAccount.id })
    if (!claimed.length) continue
    try {
      await initializeGmailWatch(env, { ...candidate, lastWatchAt: now })
      renewed += 1
    } catch (error) {
      failed += 1
      await recordMailMetric("watch_health", {
        code: error instanceof GmailApiError ? error.code : "watch_failed",
        connectionId: candidate.id,
        outcome: "failure",
      })
      await db
        .update(gmailAccount)
        .set({
          lastErrorCode: error instanceof GmailApiError ? error.code : "watch_failed",
          status: error instanceof GmailApiError && error.code === "authorization_revoked"
            ? "reconnect_required"
            : candidate.status,
          updatedAt: new Date(),
        })
        .where(eq(gmailAccount.id, candidate.id))
    }
  }
  return { failed, renewed }
}

export async function stopGmailWatch(
  env: RuntimeEnv,
  connection: typeof gmailAccount.$inferSelect,
) {
  try {
    await (await createGmailGateway(env, connection)).stop()
  } catch {
    // Disconnect remains local-authoritative when Google is unavailable.
  }
}

export function gmailPubsubTopic(env: RuntimeEnv) {
  const value = getStringEnv(env, "GMAIL_PUBSUB_TOPIC")?.trim()
  if (!value) return null
  if (!/^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/topics\/[A-Za-z][A-Za-z0-9._~-]{2,254}$/.test(value)) {
    throw new Error("GMAIL_PUBSUB_TOPIC is invalid.")
  }
  return value
}
