import { and, count, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { MailIndexProgress } from "@zilobase/features/mail/organization";

import { db } from "../../../infrastructure/database";
import {
  gmailAccount,
  gmailWorkspaceConnection,
  mailIndexState,
  mailMessage,
  mailThreadIndex,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import {
  createGmailGateway,
  GmailApiError,
  type GmailGateway,
  type GmailHistory,
  type GmailThread,
} from "../provider/gmail-gateway";
import {
  enqueueMailDatabaseSyncForIndexedThread,
  enqueueMailDatabaseSyncForThread,
} from "../database-sync/mail-database-sync-worker";
import {
  commitMailboxRevision,
  type MailboxChangeSet,
  applyMailboxLabelDelta,
  deleteMailboxMessage,
  mailboxMessageExists,
  mailboxThreadIsComplete,
  mailThreadIndexRecord,
  replaceMailboxLabels,
  storeMailboxMessage,
  storeMailboxThread,
} from "./mailbox-store";
import { publishMailNotification } from "@zilobase/runtime-adapter/capabilities";
import { recordRecoveredBackgroundLease } from "../../../infrastructure/background/telemetry";

const RECENT_INBOX_SIZE = 50;
const BACKFILL_PAGE_SIZE = 25;
const INDEX_LEASE_MS = 2 * 60 * 1_000;
const INDEX_RECORD_VERSION = 1;

export async function ensureMailIndexState(gmailAccountId: string) {
  const now = new Date();
  await db
    .insert(mailIndexState)
    .values({
      createdAt: now,
      gmailAccountId,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const [state] = await db
    .select()
    .from(mailIndexState)
    .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
    .limit(1);
  if (!state) throw new Error("Mail index state could not be created.");
  return state;
}

export async function getMailIndexProgress(gmailAccountId: string) {
  return serializeProgress(await ensureMailIndexState(gmailAccountId));
}

export async function advanceMailIndex(
  env: RuntimeEnv,
  gmailAccountId: string,
): Promise<MailIndexProgress> {
  const [account] = await db
    .select()
    .from(gmailAccount)
    .where(eq(gmailAccount.id, gmailAccountId))
    .limit(1);
  if (!account || account.status !== "connected") {
    throw new Error("A connected Gmail account is required.");
  }
  let state = await ensureMailIndexState(gmailAccountId);
  const leaseToken = crypto.randomUUID();
  const [claimed] = await db
    .update(mailIndexState)
    .set({
      leaseExpiresAt: sql`current_timestamp + (${INDEX_LEASE_MS} * interval '1 millisecond')`,
      leaseToken,
      updatedAt: sql`current_timestamp`,
    })
    .where(
      and(
        eq(mailIndexState.gmailAccountId, gmailAccountId),
        or(
          isNull(mailIndexState.leaseExpiresAt),
          lt(mailIndexState.leaseExpiresAt, sql`current_timestamp`),
        ),
      ),
    )
    .returning();
  if (!claimed) return serializeProgress(state);
  if (state.leaseExpiresAt && state.leaseToken) recordRecoveredBackgroundLease(env, "mail.index");
  state = claimed;
  if ((state.recordVersion ?? 0) < INDEX_RECORD_VERSION && state.status === "ready") {
    const [pending] = await db
      .update(mailIndexState)
      .set({
        completedAt: null,
        historyId: null,
        historyPageToken: null,
        historyStartId: null,
        nextPageToken: null,
        status: "pending",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mailIndexState.gmailAccountId, gmailAccountId),
          eq(mailIndexState.leaseToken, leaseToken),
        ),
      )
      .returning();
    if (pending) state = pending;
  }
  let nextAdvanceAt: Date | null = null;
  try {
    try {
      const gateway = await createGmailGateway(env, account, { trafficClass: "background" });
      if (
        state.status === "syncing" &&
        !newerHistory(state.desiredHistoryId, state.appliedHistoryId ?? state.historyId)
      ) {
        const profile = await gateway.getProfile();
        if (newerHistory(profile.historyId ?? null, state.appliedHistoryId ?? state.historyId)) {
          const [discovered] = await db
            .update(mailIndexState)
            .set({ desiredHistoryId: profile.historyId, updatedAt: new Date() })
            .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
            .returning();
          if (discovered) state = discovered;
        } else {
          const [idle] = await db
            .update(mailIndexState)
            .set({
              status: state.backfillCompleteAt ? "ready" : "backfilling",
              updatedAt: new Date(),
            })
            .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
            .returning();
          if (idle) state = idle;
        }
      }
      if (
        (state.status === "ready" ||
          state.status === "syncing" ||
          state.status === "backfilling") &&
        newerHistory(state.desiredHistoryId, state.appliedHistoryId ?? state.historyId)
      ) {
        state = await advanceHistory(env, gateway, state);
      } else {
        state = await advanceBackfill(env, gateway, state);
      }
      if (state.status === "backfilling" || state.status === "syncing")
        nextAdvanceAt = new Date(Date.now() + 5_000);
      await db
        .update(mailIndexState)
        .set({ consecutiveFailures: 0, lastSuccessAt: new Date() })
        .where(eq(mailIndexState.gmailAccountId, gmailAccountId));
      return serializeProgress(state);
    } catch (error) {
      if (error instanceof GmailApiError && error.code === "history_cursor_invalid") {
        const [reset] = await db
          .update(mailIndexState)
          .set({
            completedAt: null,
            appliedHistoryId: null,
            backfillCompleteAt: null,
            bootstrapHistoryId: null,
            historyId: null,
            historyPageToken: null,
            historyStartId: null,
            indexedThreadCount: 0,
            lastErrorCode: "history_cursor_invalid",
            nextPageToken: null,
            recentReadyAt: null,
            status: "pending",
            updatedAt: new Date(),
          })
          .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
          .returning();
        return serializeProgress(reset ?? state);
      }
      if (error instanceof GmailApiError && error.code === "quota_exceeded") {
        nextAdvanceAt = new Date(Date.now() + Math.max(60_000, error.retryAfterMs ?? 0));
      }
      const failures = state.consecutiveFailures + 1;
      nextAdvanceAt ??= new Date(Date.now() + mailIndexRetryMs(failures));
      const code = error instanceof GmailApiError ? error.code : "index_failed";
      const historyMode = state.status === "ready" || state.status === "syncing";
      const [failed] = await db
        .update(mailIndexState)
        .set({
          consecutiveFailures: failures,
          lastErrorCode: code,
          status: historyMode ? "syncing" : "error",
          updatedAt: new Date(),
        })
        .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
        .returning();
      if (error instanceof GmailApiError && error.code === "authorization_revoked") throw error;
      return serializeProgress(failed ?? state);
    }
  } finally {
    await db
      .update(mailIndexState)
      .set({
        leaseExpiresAt: nextAdvanceAt,
        leaseToken: null,
        nextAttemptAt: nextAdvanceAt ?? new Date(Date.now() + 5_000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mailIndexState.gmailAccountId, gmailAccountId),
          eq(mailIndexState.leaseToken, leaseToken),
        ),
      );
  }
}

export async function publishMailIndexUpdate(env: RuntimeEnv, gmailAccountId: string) {
  const rows = await db
    .select({
      bindingId: gmailWorkspaceConnection.id,
      connectionId: gmailAccount.id,
      revision: mailIndexState.committedRevision,
      userId: gmailAccount.userId,
      workspaceId: gmailWorkspaceConnection.workspaceId,
    })
    .from(gmailAccount)
    .innerJoin(
      gmailWorkspaceConnection,
      eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id),
    )
    .innerJoin(mailIndexState, eq(mailIndexState.gmailAccountId, gmailAccount.id))
    .where(eq(gmailAccount.id, gmailAccountId));
  await Promise.all(rows.map((event) => publishMailNotification(event)));
}

async function advanceBackfill(
  env: RuntimeEnv,
  gateway: Pick<GmailGateway, "getProfile" | "getThreads" | "listLabels" | "listThreads">,
  existing: typeof mailIndexState.$inferSelect,
) {
  let state = existing;
  if (
    state.status === "pending" ||
    state.generation === 0 ||
    (state.recordVersion ?? 0) < INDEX_RECORD_VERSION
  ) {
    const [profile, labels, recent] = await Promise.all([
      gateway.getProfile(),
      gateway.listLabels(),
      gateway.listThreads({ labelIds: ["INBOX"], maxResults: RECENT_INBOX_SIZE }),
    ]);
    const bootstrapHistoryId =
      state.bootstrapHistoryId ?? state.desiredHistoryId ?? profile.historyId ?? null;
    const recentIds = (recent.threads ?? []).flatMap((thread) => (thread.id ? [thread.id] : []));
    const recentThreads = await gateway.getThreads(recentIds, "full");
    await replaceMailboxLabels(state.gmailAccountId, labels.labels ?? []);
    await upsertIndexedThreads(
      env,
      state.gmailAccountId,
      state.generation + 1,
      recentThreads,
      true,
    );
    if (recentThreads.length || (labels.labels?.length ?? 0) > 0) {
      await commitMailboxRevision(state.gmailAccountId, changesForThreads(recentThreads, true));
    }
    const [started] = await db
      .update(mailIndexState)
      .set({
        completedAt: null,
        appliedHistoryId: bootstrapHistoryId,
        bootstrapHistoryId,
        generation: state.generation + 1,
        historyId: bootstrapHistoryId,
        indexedThreadCount: recentThreads.length,
        lastErrorCode: null,
        nextPageToken: null,
        recordVersion: INDEX_RECORD_VERSION,
        recentReadyAt: new Date(),
        resultSizeEstimate: profile.threadsTotal ?? null,
        startedAt: new Date(),
        status: "backfilling",
        updatedAt: new Date(),
      })
      .where(eq(mailIndexState.gmailAccountId, state.gmailAccountId))
      .returning();
    if (!started) throw new Error("Mail index backfill could not start.");
    state = started;
  } else if (state.status === "error") {
    const [resumed] = await db
      .update(mailIndexState)
      .set({ lastErrorCode: null, status: "backfilling", updatedAt: new Date() })
      .where(eq(mailIndexState.gmailAccountId, state.gmailAccountId))
      .returning();
    if (resumed) state = resumed;
  }

  const page = await gateway.listThreads({
    includeSpamTrash: true,
    maxResults: BACKFILL_PAGE_SIZE,
    pageToken: state.nextPageToken ?? undefined,
  });
  const threadIds = (page.threads ?? []).flatMap((thread) => (thread.id ? [thread.id] : []));
  const complete = threadIds.length
    ? await db
        .select({ id: mailThreadIndex.gmailThreadId })
        .from(mailThreadIndex)
        .where(
          and(
            eq(mailThreadIndex.gmailAccountId, state.gmailAccountId),
            eq(mailThreadIndex.hydrationStatus, "complete"),
            inArray(mailThreadIndex.gmailThreadId, threadIds),
          ),
        )
    : [];
  const completeIds = new Set(complete.map(({ id }) => id));
  const missingIds = threadIds.filter((id) => !completeIds.has(id));
  const threads = await gateway.getThreads(missingIds, "full");
  await upsertIndexedThreads(env, state.gmailAccountId, state.generation, threads, true);
  if (threads.length) await commitMailboxRevision(state.gmailAccountId, changesForThreads(threads));
  const indexedThreadCount = state.indexedThreadCount + threadIds.length;
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
      .returning();
    if (!continued) throw new Error("Mail index backfill cursor could not be saved.");
    return continued;
  }

  await db
    .delete(mailThreadIndex)
    .where(
      and(
        eq(mailThreadIndex.gmailAccountId, state.gmailAccountId),
        ne(mailThreadIndex.generation, state.generation),
      ),
    );
  await db
    .delete(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, state.gmailAccountId),
        ne(mailMessage.generation, state.generation),
      ),
    );
  const [actual] = await db
    .select({ value: count() })
    .from(mailThreadIndex)
    .where(eq(mailThreadIndex.gmailAccountId, state.gmailAccountId));
  const [completed] = await db
    .update(mailIndexState)
    .set({
      completedAt: new Date(),
      backfillCompleteAt: new Date(),
      indexedThreadCount: Number(actual?.value ?? indexedThreadCount),
      lastErrorCode: null,
      nextPageToken: null,
      recordVersion: INDEX_RECORD_VERSION,
      status: newerHistory(state.desiredHistoryId, state.appliedHistoryId ?? state.historyId)
        ? "syncing"
        : "ready",
      updatedAt: new Date(),
    })
    .where(eq(mailIndexState.gmailAccountId, state.gmailAccountId))
    .returning();
  if (!completed) throw new Error("Mail index backfill could not complete.");
  return completed;
}

async function advanceHistory(
  env: RuntimeEnv,
  gateway: Pick<GmailGateway, "getMessage" | "getThread" | "listHistory">,
  existing: typeof mailIndexState.$inferSelect,
) {
  if (!existing.historyId) {
    const [reset] = await db
      .update(mailIndexState)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(mailIndexState.gmailAccountId, existing.gmailAccountId))
      .returning();
    return reset ?? existing;
  }
  const startHistoryId = existing.historyStartId ?? existing.historyId;
  const page = await gateway.listHistory({
    maxResults: 100,
    pageToken: existing.historyPageToken ?? undefined,
    startHistoryId,
  });
  const changes = await applyHistoryPage(env, gateway, existing, page.history ?? []);
  if (changes) await commitMailboxRevision(existing.gmailAccountId, changes);
  const cursor = page.historyId ?? existing.historyId;
  const pageToken = page.nextPageToken;
  const [updated] = await db
    .update(mailIndexState)
    .set(
      pageToken
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
            appliedHistoryId: cursor,
            status: existing.backfillCompleteAt ? "ready" : "backfilling",
            updatedAt: new Date(),
          },
    )
    .where(eq(mailIndexState.gmailAccountId, existing.gmailAccountId))
    .returning();
  if (!updated) throw new Error("Mail index history cursor could not be saved.");
  return updated;
}

async function applyHistoryPage(
  env: RuntimeEnv,
  gateway: Pick<GmailGateway, "getMessage" | "getThread">,
  state: typeof mailIndexState.$inferSelect,
  history: GmailHistory[],
) {
  const additions = new Map<string, { messageId: string; threadId: string }>();
  const deleted = new Set<string>();
  const addedLabels = new Map<string, Set<string>>();
  const removedLabels = new Map<string, Set<string>>();
  const affectedThreads = new Set<string>();
  for (const event of history) {
    for (const entry of event.messagesAdded ?? []) {
      if (entry.message?.id && entry.message.threadId)
        additions.set(entry.message.id, {
          messageId: entry.message.id,
          threadId: entry.message.threadId,
        });
      if (entry.message?.threadId) affectedThreads.add(entry.message.threadId);
    }
    for (const entry of event.messagesDeleted ?? []) {
      if (entry.message?.id) deleted.add(entry.message.id);
      if (entry.message?.threadId) affectedThreads.add(entry.message.threadId);
    }
    for (const entry of event.labelsAdded ?? []) {
      if (!entry.message?.id) continue;
      if (entry.message.threadId) affectedThreads.add(entry.message.threadId);
      const labels = addedLabels.get(entry.message.id) ?? new Set<string>();
      for (const label of entry.labelIds ?? []) labels.add(label);
      addedLabels.set(entry.message.id, labels);
    }
    for (const entry of event.labelsRemoved ?? []) {
      if (!entry.message?.id) continue;
      if (entry.message.threadId) affectedThreads.add(entry.message.threadId);
      const labels = removedLabels.get(entry.message.id) ?? new Set<string>();
      for (const label of entry.labelIds ?? []) labels.add(label);
      removedLabels.set(entry.message.id, labels);
    }
  }

  let changed = false;
  const changedMessages = new Set<string>();
  const hydratedThreads = new Set<string>();
  for (const { messageId, threadId } of additions.values()) {
    if (await mailboxMessageExists(state.gmailAccountId, messageId)) continue;
    try {
      if (await mailboxThreadIsComplete(state.gmailAccountId, threadId)) {
        await storeMailboxMessage(
          state.gmailAccountId,
          state.generation,
          await gateway.getMessage(messageId, "full"),
        );
      } else {
        const thread = await gateway.getThread(threadId, "full");
        await upsertIndexedThreads(env, state.gmailAccountId, state.generation, [thread], true);
        hydratedThreads.add(threadId);
      }
      changed = true;
      changedMessages.add(messageId);
    } catch (error) {
      if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
    }
  }
  for (const messageId of new Set([...addedLabels.keys(), ...removedLabels.keys()])) {
    const applied = await applyMailboxLabelDelta({
      addLabelIds: [...(addedLabels.get(messageId) ?? [])],
      gmailAccountId: state.gmailAccountId,
      gmailMessageId: messageId,
      removeLabelIds: [...(removedLabels.get(messageId) ?? [])],
    });
    if (applied) {
      changed = true;
      changedMessages.add(messageId);
    }
    if (applied || additions.has(messageId)) continue;
    const eventMessage = history
      .flatMap((event) => [...(event.labelsAdded ?? []), ...(event.labelsRemoved ?? [])])
      .find((entry) => entry.message?.id === messageId)?.message;
    if (!eventMessage?.threadId || hydratedThreads.has(eventMessage.threadId)) continue;
    try {
      const thread = await gateway.getThread(eventMessage.threadId, "full");
      await upsertIndexedThreads(env, state.gmailAccountId, state.generation, [thread], true);
      hydratedThreads.add(eventMessage.threadId);
      changed = true;
      for (const message of thread.messages ?? []) {
        if (message.id) changedMessages.add(message.id);
      }
    } catch (error) {
      if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
    }
  }
  for (const messageId of deleted) {
    if (await deleteMailboxMessage(state.gmailAccountId, messageId)) {
      changed = true;
      changedMessages.add(messageId);
    }
  }
  if (changed) {
    for (const threadId of affectedThreads) {
      await enqueueMailDatabaseSyncForThread(state.gmailAccountId, threadId, env);
    }
  }
  return changed
    ? ({ messageIds: changedMessages, threadIds: affectedThreads } satisfies MailboxChangeSet)
    : null;
}

function changesForThreads(threads: GmailThread[], labelsChanged = false): MailboxChangeSet {
  return {
    labelsChanged,
    messageIds: threads.flatMap((thread) =>
      (thread.messages ?? []).flatMap((message) => (message.id ? [message.id] : [])),
    ),
    threadIds: threads.flatMap((thread) => (thread.id ? [thread.id] : [])),
  };
}

async function upsertIndexedThreads(
  env: RuntimeEnv,
  gmailAccountId: string,
  generation: number,
  threads: GmailThread[],
  includeBody = false,
) {
  for (const thread of threads) {
    const row = await storeMailboxThread(gmailAccountId, generation, thread, includeBody);
    await enqueueMailDatabaseSyncForIndexedThread(row, env);
  }
}

function newerHistory(candidate: string | null, applied: string | null) {
  if (!candidate) return false;
  if (!applied) return true;
  return BigInt(candidate) > BigInt(applied);
}

export function mailIndexRetryMs(failures: number, random = Math.random) {
  const ceiling = Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, failures - 1));
  return Math.max(1_000, Math.floor(random() * ceiling));
}

export { mailThreadIndexRecord } from "./mailbox-store";

function serializeProgress(state: typeof mailIndexState.$inferSelect): MailIndexProgress {
  return {
    completedAt: state.completedAt?.toISOString() ?? null,
    indexedThreadCount: state.indexedThreadCount,
    lastErrorCode: state.lastErrorCode,
    resultSizeEstimate: state.resultSizeEstimate,
    status: state.status as MailIndexProgress["status"],
  };
}
