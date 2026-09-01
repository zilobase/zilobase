import { and, desc, eq, lt, or } from "drizzle-orm"
import {
  evaluateMailFilterExpression,
  mailSystemFolderIds,
  normalizeMailViewConfig,
  type MailAddress,
  type MailFilterExpression,
  type MailFilterRecord,
  type MailIndexedThread,
  type MailSystemFolderId,
  type MailThreadSummary,
  type MailViewQueryResponse,
} from "@zilobase/features/mail"

import { db } from "../../infrastructure/database"
import {
  gmailAccount,
  mailIndexState,
  mailThreadIndex,
  mailView,
} from "../../infrastructure/database/schema"
import type { RuntimeEnv } from "../../shared/config/config"
import { createGmailGateway } from "./gmail-gateway"
import { getMailIndexProgress } from "./mail-index"

const QUERY_BATCH_SIZE = 200
const MAX_QUERY_BATCHES = 10
const GMAIL_SEARCH_PAGE_SIZE = 500
const MAX_GMAIL_SEARCH_PAGES = 10

type Cursor = { id: string; internalDate: number }

export class MailQueryError extends Error {
  constructor(message: string, readonly status: 400 | 404) {
    super(message)
    this.name = "MailQueryError"
  }
}

export async function queryIndexedMail(input: {
  bindingId: string
  cursor?: string
  env: RuntimeEnv
  gmailAccountId: string
  limit?: number
  routeId: string
  search?: string
}): Promise<MailViewQueryResponse> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100))
  let cursor = input.cursor ? decodeMailQueryCursor(input.cursor) : null
  const filter = await filterForRoute(input.bindingId, input.routeId)
  const index = await getMailIndexProgress(input.gmailAccountId)
  const search = input.search?.trim() ?? ""
  const searchResult = search
    ? await searchGmailThreadIds(input.env, input.gmailAccountId, search)
    : null
  const threads: MailIndexedThread[] = []
  let nextCursor: string | null = null

  for (let batchNumber = 0; batchNumber < MAX_QUERY_BATCHES; batchNumber += 1) {
    const rows = await db
      .select()
      .from(mailThreadIndex)
      .where(and(
        eq(mailThreadIndex.gmailAccountId, input.gmailAccountId),
        ...(cursor ? [or(
          lt(mailThreadIndex.internalDate, cursor.internalDate),
          and(
            eq(mailThreadIndex.internalDate, cursor.internalDate),
            lt(mailThreadIndex.id, cursor.id),
          ),
        )!] : []),
      ))
      .orderBy(desc(mailThreadIndex.internalDate), desc(mailThreadIndex.id))
      .limit(QUERY_BATCH_SIZE)

    if (!rows.length) {
      nextCursor = null
      break
    }
    for (const row of rows) {
      cursor = { id: row.id, internalDate: row.internalDate }
      const indexed = serializeIndexedThread(row)
      if (
        evaluateMailFilterExpression(indexedFilterRecord(indexed), filter) &&
        (!searchResult || searchResult.threadIds.has(indexed.thread.id))
      ) {
        threads.push(indexed)
      }
      if (threads.length >= limit) break
    }
    nextCursor = cursor ? encodeMailQueryCursor(cursor) : null
    if (threads.length >= limit) break
    if (rows.length < QUERY_BATCH_SIZE) {
      nextCursor = null
      break
    }
  }

  return {
    index,
    nextCursor,
    searchTruncated: searchResult?.truncated ?? false,
    threads,
  }
}

export function encodeMailQueryCursor(cursor: Cursor) {
  return btoa(JSON.stringify(cursor))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "")
}

export function decodeMailQueryCursor(value: string): Cursor {
  try {
    if (!/^[A-Za-z0-9_-]{1,500}$/.test(value)) throw new Error()
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
    const parsed = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as Record<string, unknown>
    if (
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.internalDate !== "number" ||
      !Number.isSafeInteger(parsed.internalDate)
    ) throw new Error()
    return { id: parsed.id, internalDate: parsed.internalDate }
  } catch {
    throw new MailQueryError("The mail query cursor is invalid.", 400)
  }
}

async function filterForRoute(
  bindingId: string,
  routeId: string,
): Promise<MailFilterExpression> {
  if (mailSystemFolderIds.includes(routeId as MailSystemFolderId)) {
    return mailboxFilter(routeId as MailSystemFolderId)
  }
  const [view] = await db
    .select({ config: mailView.config })
    .from(mailView)
    .where(and(eq(mailView.bindingId, bindingId), eq(mailView.id, routeId)))
    .limit(1)
  if (!view) throw new MailQueryError("Mail view not found.", 404)
  return normalizeMailViewConfig(view.config).filter
}

function mailboxFilter(folderId: MailSystemFolderId): MailFilterExpression {
  return {
    filters: [{
      id: `system-${folderId}`,
      operator: "is",
      propertyId: "mailbox",
      type: "condition",
      values: [folderId],
    }],
    id: "system-root",
    operator: "and",
    type: "group",
  }
}

async function searchGmailThreadIds(
  env: RuntimeEnv,
  gmailAccountId: string,
  query: string,
) {
  const [account] = await db
    .select()
    .from(gmailAccount)
    .where(eq(gmailAccount.id, gmailAccountId))
    .limit(1)
  if (!account) throw new MailQueryError("Gmail account not found.", 404)
  const gateway = await createGmailGateway(env, account)
  const threadIds = new Set<string>()
  let pageToken: string | undefined
  let truncated = false
  for (let pageNumber = 0; pageNumber < MAX_GMAIL_SEARCH_PAGES; pageNumber += 1) {
    const page = await gateway.listMessages({
      includeSpamTrash: true,
      maxResults: GMAIL_SEARCH_PAGE_SIZE,
      pageToken,
      query,
    })
    for (const message of page.messages ?? []) {
      if (message.threadId) threadIds.add(message.threadId)
    }
    pageToken = page.nextPageToken
    if (!pageToken) break
    if (pageNumber === MAX_GMAIL_SEARCH_PAGES - 1) truncated = true
  }
  return { threadIds, truncated }
}

function serializeIndexedThread(
  row: typeof mailThreadIndex.$inferSelect,
): MailIndexedThread {
  const from = addresses(row.fromAddresses)
  const to = addresses(row.toAddresses)
  const cc = addresses(row.ccAddresses)
  const bcc = addresses(row.bccAddresses)
  const thread: MailThreadSummary = {
    attachmentCount: row.attachmentCount,
    id: row.gmailThreadId,
    internalDate: row.internalDate,
    labelIds: row.labelIds,
    latestMessageId: row.latestMessageId,
    messageCount: row.messageCount,
    messageIds: row.messageIds,
    participants: uniqueAddresses([...from, ...to]),
    snippet: "",
    starred: row.starred,
    subject: row.subject,
    unread: row.unread,
  }
  return {
    bcc,
    cc,
    from,
    hasCalendarEvent: row.hasCalendarEvent,
    important: row.important,
    thread,
    to,
  }
}

function indexedFilterRecord(indexed: MailIndexedThread): MailFilterRecord {
  return {
    attachmentCount: indexed.thread.attachmentCount,
    bcc: indexed.bcc,
    cc: indexed.cc,
    from: indexed.from,
    hasCalendarEvent: indexed.hasCalendarEvent,
    important: indexed.important,
    internalDate: indexed.thread.internalDate,
    labelIds: indexed.thread.labelIds,
    starred: indexed.thread.starred,
    subject: indexed.thread.subject,
    to: indexed.to,
    unread: indexed.thread.unread,
  }
}

function addresses(value: unknown): MailAddress[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): MailAddress[] => {
    if (!item || typeof item !== "object") return []
    const address = (item as { address?: unknown }).address
    const name = (item as { name?: unknown }).name
    return typeof address === "string"
      ? [{ address, name: typeof name === "string" ? name : null }]
      : []
  })
}

function uniqueAddresses(items: MailAddress[]) {
  const seen = new Set<string>()
  return items.filter(({ address }) => {
    if (seen.has(address)) return false
    seen.add(address)
    return true
  })
}
