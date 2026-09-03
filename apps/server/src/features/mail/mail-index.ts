import { and, asc, count, eq, isNull, lt, ne, or, sql } from "drizzle-orm"
import type { MailAddress, MailIndexProgress } from "@zilobase/features/mail"

import { db } from "../../infrastructure/database"
import {
  gmailAccount,
  gmailWorkspaceConnection,
  mailIndexState,
  mailThreadIndex,
} from "../../infrastructure/database/schema"
import type { RuntimeEnv } from "../../shared/config/config"
import {
  createGmailGateway,
  GmailApiError,
  type GmailGateway,
  type GmailHistory,
  type GmailPart,
  type GmailThread,
} from "./gmail-gateway"
import { normalizeGmailThread } from "./mail-normalize"
import { enqueueMailDatabaseSyncForIndexedThread } from "./mail-database-sync-worker"
import { recordMailMetric } from "./mail-metrics"
import { publishMailNotification } from "../../infrastructure/runtime/runtime-adapter"
import { recordRecoveredBackgroundLease } from "../../infrastructure/background/telemetry"

const BACKFILL_PAGE_SIZE = 100
const MAX_HISTORY_PAGES_PER_ADVANCE = 5
const INDEX_LEASE_MS = 2 * 60 * 1_000

export async function ensureMailIndexState(gmailAccountId: string) {
  const now = new Date()
  await db
    .insert(mailIndexState)
    .values({
      createdAt: now,
      gmailAccountId,
      updatedAt: now,
    })
    .onConflictDoNothing()
  const [state] = await db
    .select()
    .from(mailIndexState)
    .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
    .limit(1)
  if (!state) throw new Error("Mail index state could not be created.")
  return state
}

export async function getMailIndexProgress(gmailAccountId: string) {
  return serializeProgress(await ensureMailIndexState(gmailAccountId))
}

export async function advanceMailIndex(
  env: RuntimeEnv,
  gmailAccountId: string,
): Promise<MailIndexProgress> {
  const [account] = await db
    .select()
    .from(gmailAccount)
    .where(eq(gmailAccount.id, gmailAccountId))
    .limit(1)
  if (!account || account.status !== "connected") {
    throw new Error("A connected Gmail account is required.")
  }
  let state = await ensureMailIndexState(gmailAccountId)
  const leaseToken = crypto.randomUUID()
  const [claimed] = await db
    .update(mailIndexState)
    .set({
      leaseExpiresAt: sql`current_timestamp + (${INDEX_LEASE_MS} * interval '1 millisecond')`,
      leaseToken,
      updatedAt: sql`current_timestamp`,
    })
    .where(and(
      eq(mailIndexState.gmailAccountId, gmailAccountId),
      or(
        isNull(mailIndexState.leaseExpiresAt),
        lt(mailIndexState.leaseExpiresAt, sql`current_timestamp`),
      ),
    ))
    .returning()
  if (!claimed) return serializeProgress(state)
  if (state.leaseExpiresAt) recordRecoveredBackgroundLease(env, "mail.index")
  state = claimed
  try {
    try {
      const gateway = await createGmailGateway(env, account)
      if (state.status === "ready" || state.status === "syncing") {
        state = await advanceHistory(env, gateway, state)
      } else {
        state = await advanceBackfill(env, gateway, state)
      }
      return serializeProgress(state)
    } catch (error) {
      if (error instanceof GmailApiError && error.code === "history_cursor_invalid") {
        const [reset] = await db
          .update(mailIndexState)
          .set({
            completedAt: null,
            historyId: null,
            historyPageToken: null,
            historyStartId: null,
            indexedThreadCount: 0,
            lastErrorCode: "history_cursor_invalid",
            nextPageToken: null,
            status: "pending",
            updatedAt: new Date(),
          })
          .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
          .returning()
        return serializeProgress(reset ?? state)
      }
      const code = error instanceof GmailApiError ? error.code : "index_failed"
      const [failed] = await db
        .update(mailIndexState)
        .set({ lastErrorCode: code, status: "error", updatedAt: new Date() })
        .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
        .returning()
      if (error instanceof GmailApiError && error.code === "authorization_revoked") throw error
      return serializeProgress(failed ?? state)
    }
  } finally {
    await db
      .update(mailIndexState)
      .set({ leaseExpiresAt: null, leaseToken: null, updatedAt: new Date() })
      .where(and(
        eq(mailIndexState.gmailAccountId, gmailAccountId),
        eq(mailIndexState.leaseToken, leaseToken),
      ))
  }
}

export async function advancePendingMailIndexes(
  env: RuntimeEnv,
  limit = 5,
) {
  const startedAt = Date.now()
  const accounts = await db
    .select({
      id: gmailAccount.id,
      notificationHistoryId: gmailAccount.notificationHistoryId,
    })
    .from(gmailAccount)
    .where(eq(gmailAccount.status, "connected"))
    .orderBy(asc(gmailAccount.updatedAt))
    .limit(100)
  let advanced = 0
  let failed = 0
  for (const account of accounts) {
    if (advanced >= Math.max(1, Math.min(limit, 25))) break
    const state = await ensureMailIndexState(account.id)
    if (
      state.status === "ready" &&
      (!account.notificationHistoryId || account.notificationHistoryId === state.historyId)
    ) {
      continue
    }
    try {
      await advanceMailIndex(env, account.id)
      await publishMailIndexUpdate(env, account.id)
      advanced += 1
    } catch {
      advanced += 1
      failed += 1
    }
  }
  if (advanced) {
    await recordMailMetric("index", {
      code: failed ? "batch_partial_failure" : "batch_complete",
      count: advanced,
      durationMs: Date.now() - startedAt,
      outcome: failed ? "failure" : "success",
    })
  }
  return { advanced, failed }
}

export async function publishMailIndexUpdate(
  env: RuntimeEnv,
  gmailAccountId: string,
) {
  const rows = await db
    .select({
      bindingId: gmailWorkspaceConnection.id,
      connectionId: gmailAccount.id,
      revision: gmailAccount.mailboxRevision,
      userId: gmailAccount.userId,
      workspaceId: gmailWorkspaceConnection.workspaceId,
    })
    .from(gmailAccount)
    .innerJoin(
      gmailWorkspaceConnection,
      eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id),
    )
    .where(eq(gmailAccount.id, gmailAccountId))
  await Promise.all(rows.map((event) => publishMailNotification(env, event)))
}

async function advanceBackfill(
  env: RuntimeEnv,
  gateway: Pick<GmailGateway, "getProfile" | "getThreads" | "listThreads">,
  existing: typeof mailIndexState.$inferSelect,
) {
  let state = existing
  if (state.status === "pending" || state.generation === 0) {
    const profile = await gateway.getProfile()
    const [started] = await db
      .update(mailIndexState)
      .set({
        completedAt: null,
        generation: state.generation + 1,
        historyId: profile.historyId ?? null,
        indexedThreadCount: 0,
        lastErrorCode: null,
        nextPageToken: null,
        resultSizeEstimate: profile.threadsTotal ?? null,
        startedAt: new Date(),
        status: "backfilling",
        updatedAt: new Date(),
      })
      .where(eq(mailIndexState.gmailAccountId, state.gmailAccountId))
      .returning()
    if (!started) throw new Error("Mail index backfill could not start.")
    state = started
  } else if (state.status === "error") {
    const [resumed] = await db
      .update(mailIndexState)
      .set({ lastErrorCode: null, status: "backfilling", updatedAt: new Date() })
      .where(eq(mailIndexState.gmailAccountId, state.gmailAccountId))
      .returning()
    if (resumed) state = resumed
  }

  const page = await gateway.listThreads({
    includeSpamTrash: true,
    maxResults: BACKFILL_PAGE_SIZE,
    pageToken: state.nextPageToken ?? undefined,
  })
  const threadIds = (page.threads ?? []).flatMap((thread) => thread.id ? [thread.id] : [])
  const threads = await gateway.getThreads(threadIds, "metadata")
  await upsertIndexedThreads(env, state.gmailAccountId, state.generation, threads)
  const indexedThreadCount = state.indexedThreadCount + threads.length
  if (page.nextPageToken) {
    const [continued] = await db
      .update(mailIndexState)
      .set({
        indexedThreadCount,
        nextPageToken: page.nextPageToken,
        resultSizeEstimate: page.resultSizeEstimate ?? state.resultSizeEstimate,
        status: "backfilling",
        updatedAt: new Date(),
      })
      .where(eq(mailIndexState.gmailAccountId, state.gmailAccountId))
      .returning()
    if (!continued) throw new Error("Mail index backfill cursor could not be saved.")
    return continued
  }

  await db
    .delete(mailThreadIndex)
    .where(and(
      eq(mailThreadIndex.gmailAccountId, state.gmailAccountId),
      ne(mailThreadIndex.generation, state.generation),
    ))
  const [actual] = await db
    .select({ value: count() })
    .from(mailThreadIndex)
    .where(eq(mailThreadIndex.gmailAccountId, state.gmailAccountId))
  const [completed] = await db
    .update(mailIndexState)
    .set({
      completedAt: new Date(),
      indexedThreadCount: Number(actual?.value ?? indexedThreadCount),
      lastErrorCode: null,
      nextPageToken: null,
      status: "ready",
      updatedAt: new Date(),
    })
    .where(eq(mailIndexState.gmailAccountId, state.gmailAccountId))
    .returning()
  if (!completed) throw new Error("Mail index backfill could not complete.")
  return completed
}

async function advanceHistory(
  env: RuntimeEnv,
  gateway: Pick<GmailGateway, "getThread" | "listHistory">,
  existing: typeof mailIndexState.$inferSelect,
) {
  if (!existing.historyId) {
    const [reset] = await db
      .update(mailIndexState)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(mailIndexState.gmailAccountId, existing.gmailAccountId))
      .returning()
    return reset ?? existing
  }
  const startHistoryId = existing.historyStartId ?? existing.historyId
  let pageToken = existing.historyPageToken ?? undefined
  let cursor = existing.historyId
  for (let pageNumber = 0; pageNumber < MAX_HISTORY_PAGES_PER_ADVANCE; pageNumber += 1) {
    const page = await gateway.listHistory({ pageToken, startHistoryId })
    const touchedThreadIds = collectTouchedThreadIds(page.history ?? [])
    await refreshTouchedThreads(
      env,
      gateway,
      existing.gmailAccountId,
      existing.generation,
      touchedThreadIds,
    )
    cursor = page.historyId ?? cursor
    pageToken = page.nextPageToken
    if (!pageToken) break
  }
  const [updated] = await db
    .update(mailIndexState)
    .set(pageToken
      ? {
          historyPageToken: pageToken,
          historyStartId: startHistoryId,
          status: "syncing",
          updatedAt: new Date(),
        }
      : {
          historyId: cursor,
          historyPageToken: null,
          historyStartId: null,
          lastErrorCode: null,
          status: "ready",
          updatedAt: new Date(),
        })
    .where(eq(mailIndexState.gmailAccountId, existing.gmailAccountId))
    .returning()
  if (!updated) throw new Error("Mail index history cursor could not be saved.")
  return updated
}

async function refreshTouchedThreads(
  env: RuntimeEnv,
  gateway: Pick<GmailGateway, "getThread">,
  gmailAccountId: string,
  generation: number,
  threadIds: Set<string>,
) {
  for (const threadId of threadIds) {
    try {
      const thread = await gateway.getThread(threadId, "metadata")
      await upsertIndexedThreads(env, gmailAccountId, generation, [thread])
    } catch (error) {
      if (!(error instanceof GmailApiError) || error.status !== 404) throw error
      await db
        .delete(mailThreadIndex)
        .where(and(
          eq(mailThreadIndex.gmailAccountId, gmailAccountId),
          eq(mailThreadIndex.gmailThreadId, threadId),
        ))
    }
  }
}

async function upsertIndexedThreads(
  env: RuntimeEnv,
  gmailAccountId: string,
  generation: number,
  threads: GmailThread[],
) {
  for (const thread of threads) {
    const row = mailThreadIndexRecord(gmailAccountId, generation, thread)
    await db
      .insert(mailThreadIndex)
      .values(row)
      .onConflictDoUpdate({
        set: {
          attachmentCount: row.attachmentCount,
          bccAddresses: row.bccAddresses,
          ccAddresses: row.ccAddresses,
          domains: row.domains,
          fromAddresses: row.fromAddresses,
          generation,
          hasCalendarEvent: row.hasCalendarEvent,
          important: row.important,
          internalDate: row.internalDate,
          labelIds: row.labelIds,
          latestMessageId: row.latestMessageId,
          messageCount: row.messageCount,
          messageIds: row.messageIds,
          receivedAt: row.receivedAt,
          starred: row.starred,
          subject: row.subject,
          toAddresses: row.toAddresses,
          unread: row.unread,
          updatedAt: row.updatedAt,
        },
        target: [mailThreadIndex.gmailAccountId, mailThreadIndex.gmailThreadId],
      })
    await enqueueMailDatabaseSyncForIndexedThread(row, env)
  }
}

export function mailThreadIndexRecord(
  gmailAccountId: string,
  generation: number,
  thread: GmailThread,
) {
  const normalized = normalizeGmailThread(thread)
  const { messages, summary } = normalized
  const fromAddresses = uniqueAddresses(messages.flatMap((message) => message.from ? [message.from] : []))
  const toAddresses = uniqueAddresses(messages.flatMap((message) => message.to))
  const ccAddresses = uniqueAddresses(messages.flatMap((message) => message.cc))
  const bccAddresses = uniqueAddresses(messages.flatMap((message) => message.bcc))
  const domains = [...new Set(
    [...fromAddresses, ...toAddresses, ...ccAddresses, ...bccAddresses]
      .map(({ address }) => address.split("@")[1])
      .filter((domain): domain is string => Boolean(domain)),
  )]
  const now = new Date()
  return {
    attachmentCount: summary.attachmentCount,
    bccAddresses,
    ccAddresses,
    createdAt: now,
    domains,
    fromAddresses,
    generation,
    gmailAccountId,
    gmailThreadId: summary.id,
    hasCalendarEvent: (thread.messages ?? []).some((message) => hasCalendarPart(message.payload)),
    id: `${gmailAccountId}:${summary.id}`,
    important: summary.labelIds.includes("IMPORTANT"),
    internalDate: summary.internalDate,
    labelIds: summary.labelIds,
    latestMessageId: summary.latestMessageId,
    messageCount: summary.messageCount,
    messageIds: summary.messageIds,
    receivedAt: new Date(summary.internalDate),
    starred: summary.starred,
    subject: summary.subject,
    toAddresses,
    unread: summary.unread,
    updatedAt: now,
  }
}

function collectTouchedThreadIds(history: GmailHistory[]) {
  const ids = new Set<string>()
  const add = (message: { threadId?: string } | undefined) => {
    if (message?.threadId) ids.add(message.threadId)
  }
  for (const event of history) {
    for (const message of event.messages ?? []) add(message)
    for (const entry of event.messagesAdded ?? []) add(entry.message)
    for (const entry of event.messagesDeleted ?? []) add(entry.message)
    for (const entry of event.labelsAdded ?? []) add(entry.message)
    for (const entry of event.labelsRemoved ?? []) add(entry.message)
  }
  return ids
}

function hasCalendarPart(part: GmailPart | undefined): boolean {
  if (!part) return false
  return part.mimeType === "text/calendar" || (part.parts ?? []).some(hasCalendarPart)
}

function uniqueAddresses(addresses: MailAddress[]) {
  const seen = new Set<string>()
  return addresses.filter(({ address }) => {
    if (seen.has(address)) return false
    seen.add(address)
    return true
  })
}

function serializeProgress(
  state: typeof mailIndexState.$inferSelect,
): MailIndexProgress {
  return {
    completedAt: state.completedAt?.toISOString() ?? null,
    indexedThreadCount: state.indexedThreadCount,
    lastErrorCode: state.lastErrorCode,
    resultSizeEstimate: state.resultSizeEstimate,
    status: state.status as MailIndexProgress["status"],
  }
}
