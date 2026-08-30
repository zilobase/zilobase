import type { MailSyncRequest, MailSyncResponse, MailView } from "@zilobase/features/mail"

import { GmailApiError, type GmailGateway, type GmailHistory } from "./gmail-gateway"
import { normalizeGmailLabels, normalizeGmailThread } from "./mail-normalize"

export async function synchronizeMailbox(
  gateway: Pick<GmailGateway, "getProfile" | "getThread" | "listHistory" | "listLabels" | "listThreads">,
  request: MailSyncRequest,
  mailboxRevision: number,
): Promise<MailSyncResponse> {
  if (!request.historyId || request.pageToken || request.query) {
    return fullSync(gateway, request, mailboxRevision, "full")
  }
  try {
    return await incrementalSync(gateway, request, mailboxRevision)
  } catch (error) {
    if (!(error instanceof GmailApiError) || error.code !== "history_cursor_invalid") throw error
    return fullSync(gateway, request, mailboxRevision, "recovery")
  }
}

async function fullSync(
  gateway: Pick<GmailGateway, "getProfile" | "getThread" | "listLabels" | "listThreads">,
  request: MailSyncRequest,
  mailboxRevision: number,
  mode: "full" | "recovery",
): Promise<MailSyncResponse> {
  const filter = viewFilter(request.view)
  const [listed, labelResponse, profile] = await Promise.all([
    gateway.listThreads({
      labelIds: filter.labelIds,
      maxResults: 50,
      pageToken: request.pageToken,
      query: [filter.query, request.query].filter(Boolean).join(" ") || undefined,
    }),
    gateway.listLabels(),
    gateway.getProfile(),
  ])
  const normalized = await Promise.all(
    (listed.threads ?? []).flatMap((thread) => thread.id ? [gateway.getThread(thread.id, "metadata")] : []),
  )
  const records = normalized.map((thread) => normalizeGmailThread(thread))
  const historyId = maxHistoryId(normalized.map((thread) => thread.historyId), profile.historyId ?? "0")
  const currentMessageIds = new Set(records.flatMap((record) => record.messages.map((message) => message.id)))
  const currentThreadIds = new Set(records.map((record) => record.summary.id))
  return {
    deletedMessageIds: mode === "recovery"
      ? (request.knownMessageIds ?? []).filter((id) => !currentMessageIds.has(id))
      : [],
    deletedThreadIds: mode === "recovery"
      ? (request.knownThreadIds ?? []).filter((id) => !currentThreadIds.has(id))
      : [],
    historyId,
    labels: normalizeGmailLabels(labelResponse.labels ?? []),
    mailboxRevision,
    messages: records.flatMap((record) => record.messages),
    mode,
    nextPageToken: listed.nextPageToken ?? null,
    threads: records.map((record) => record.summary),
  }
}

async function incrementalSync(
  gateway: Pick<GmailGateway, "getThread" | "listHistory" | "listLabels">,
  request: MailSyncRequest,
  mailboxRevision: number,
): Promise<MailSyncResponse> {
  const touchedThreads = new Set<string>()
  const deletedMessageIds = new Set<string>()
  let cursor = request.historyId!
  let pageToken: string | undefined
  do {
    const page = await gateway.listHistory({ pageToken, startHistoryId: request.historyId! })
    for (const event of page.history ?? []) collectHistory(event, touchedThreads, deletedMessageIds)
    cursor = page.historyId ?? cursor
    pageToken = page.nextPageToken
  } while (pageToken)

  const deletedThreadIds: string[] = []
  const updated = []
  for (const threadId of touchedThreads) {
    try {
      updated.push(normalizeGmailThread(await gateway.getThread(threadId, "metadata")))
    } catch (error) {
      if (error instanceof GmailApiError && error.status === 404) deletedThreadIds.push(threadId)
      else throw error
    }
  }
  const labelResponse = await gateway.listLabels()
  return {
    deletedMessageIds: [...deletedMessageIds],
    deletedThreadIds,
    historyId: cursor,
    labels: normalizeGmailLabels(labelResponse.labels ?? []),
    mailboxRevision,
    messages: updated.flatMap((record) => record.messages),
    mode: "incremental",
    nextPageToken: null,
    threads: updated.map((record) => record.summary),
  }
}

function collectHistory(
  event: GmailHistory,
  touchedThreads: Set<string>,
  deletedMessageIds: Set<string>,
) {
  for (const entry of event.messagesAdded ?? []) addThread(entry.message, touchedThreads)
  for (const entry of event.labelsAdded ?? []) addThread(entry.message, touchedThreads)
  for (const entry of event.labelsRemoved ?? []) addThread(entry.message, touchedThreads)
  for (const entry of event.messagesDeleted ?? []) {
    addThread(entry.message, touchedThreads)
    if (entry.message?.id) deletedMessageIds.add(entry.message.id)
  }
}

function addThread(message: { threadId?: string } | undefined, ids: Set<string>) {
  if (message?.threadId) ids.add(message.threadId)
}

export function viewFilter(view: MailView) {
  switch (view) {
    case "archive": return { query: "-in:inbox -in:sent -in:drafts -in:spam -in:trash" }
    case "drafts": return { labelIds: ["DRAFT"] }
    case "inbox": return { labelIds: ["INBOX"] }
    case "sent": return { labelIds: ["SENT"] }
    case "spam": return { labelIds: ["SPAM"] }
    case "starred": return { labelIds: ["STARRED"] }
    case "trash": return { labelIds: ["TRASH"] }
    case "unread": return { labelIds: ["UNREAD"] }
  }
}

function maxHistoryId(values: Array<string | undefined>, fallback: string) {
  return values.reduce<string>((maximum, value) => {
    if (!value) return maximum
    try {
      return BigInt(value) > BigInt(maximum) ? value : maximum
    } catch {
      return maximum
    }
  }, fallback)
}
