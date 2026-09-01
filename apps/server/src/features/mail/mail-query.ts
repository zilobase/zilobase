import { and, desc, eq, inArray, lt, or } from "drizzle-orm"
import {
  evaluateMailFilterExpression,
  mailSystemFolderIds,
  normalizeMailFilterExpression,
  normalizeMailViewConfig,
  type MailAddress,
  type MailFilterExpression,
  type MailFilterRecord,
  type MailGroupConfig,
  type MailIndexedThread,
  type MailQueryGroup,
  type MailSystemFolderId,
  type MailThreadPropertyValue,
  type MailThreadSummary,
  type MailViewQueryResponse,
  type MailViewConfig,
  type MailViewGroupsResponse,
} from "@zilobase/features/mail"

import { db } from "../../infrastructure/database"
import {
  gmailAccount,
  mailIndexState,
  mailProperty,
  mailThreadIndex,
  mailThreadPropertyValue,
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
  filter?: MailFilterExpression
  gmailAccountId: string
  groupKey?: string
  limit?: number
  routeId: string
  search?: string
}): Promise<MailViewQueryResponse> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100))
  let cursor = input.cursor ? decodeMailQueryCursor(input.cursor) : null
  const routeConfig = await configForRoute(input.bindingId, input.routeId)
  const routeFilter = routeConfig?.filter ?? mailboxFilter(input.routeId as MailSystemFolderId)
  const filter = input.filter
    ? normalizeMailFilterExpression(input.filter)
    : routeFilter
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
    const customValues = await loadCustomValues(input.bindingId, rows.map((row) => row.gmailThreadId))
    for (const row of rows) {
      cursor = { id: row.id, internalDate: row.internalDate }
      const indexed = serializeIndexedThread(row, customValues.get(row.gmailThreadId))
      if (
        evaluateMailFilterExpression(indexedFilterRecord(indexed), filter) &&
        (!input.groupKey || groupKeys(indexed, routeConfig?.group ?? null).includes(input.groupKey)) &&
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

export async function queryIndexedMailGroups(input: {
  bindingId: string
  env: RuntimeEnv
  filter?: MailFilterExpression
  gmailAccountId: string
  routeId: string
  search?: string
}): Promise<MailViewGroupsResponse> {
  const config = await configForRoute(input.bindingId, input.routeId)
  const index = await getMailIndexProgress(input.gmailAccountId)
  if (!config?.group) return { group: null, groups: [], index }
  const filter = input.filter
    ? normalizeMailFilterExpression(input.filter)
    : config.filter
  const search = input.search?.trim() ?? ""
  const searchResult = search
    ? await searchGmailThreadIds(input.env, input.gmailAccountId, search)
    : null
  const rows = await db
    .select()
    .from(mailThreadIndex)
    .where(eq(mailThreadIndex.gmailAccountId, input.gmailAccountId))
    .orderBy(desc(mailThreadIndex.internalDate), desc(mailThreadIndex.id))
  const customValues = await loadCustomValues(input.bindingId, rows.map((row) => row.gmailThreadId))
  const counts = new Map<string, { count: number; label: string }>()
  for (const row of rows) {
    const indexed = serializeIndexedThread(row, customValues.get(row.gmailThreadId))
    if (
      !evaluateMailFilterExpression(indexedFilterRecord(indexed), filter) ||
      (searchResult && !searchResult.threadIds.has(indexed.thread.id))
    ) continue
    for (const { key, label } of groupEntries(indexed, config.group)) {
      const current = counts.get(key)
      counts.set(key, { count: (current?.count ?? 0) + 1, label })
    }
  }
  const mutable = isMutableGroup(config.group.propertyId)
  const groups: MailQueryGroup[] = [...counts.entries()]
    .map(([key, value]) => ({
      count: value.count,
      cursor: encodeMailGroupCursor(key),
      key,
      label: value.label,
      mutable,
    }))
    .sort((left, right) => groupOrder(config.group!, left, right))
  return { group: config.group, groups, index }
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

export function encodeMailGroupCursor(groupKey: string) {
  return btoa(JSON.stringify({ groupKey }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "")
}

async function configForRoute(
  bindingId: string,
  routeId: string,
): Promise<MailViewConfig | null> {
  if (mailSystemFolderIds.includes(routeId as MailSystemFolderId)) {
    return null
  }
  const [view] = await db
    .select({ config: mailView.config })
    .from(mailView)
    .where(and(eq(mailView.bindingId, bindingId), eq(mailView.id, routeId)))
    .limit(1)
  if (!view) throw new MailQueryError("Mail view not found.", 404)
  return normalizeMailViewConfig(view.config)
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
  customValues: Record<string, MailThreadPropertyValue["value"]> = {},
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
    customValues,
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
    customValues: indexed.customValues,
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

function groupKeys(indexed: MailIndexedThread, group: MailGroupConfig | null) {
  return group ? groupEntries(indexed, group).map(({ key }) => key) : []
}

function groupEntries(indexed: MailIndexedThread, group: MailGroupConfig): Array<{ key: string; label: string }> {
  const thread = indexed.thread
  switch (group.propertyId) {
    case "date":
    case "received_date": {
      const key = dateGroupKey(thread.internalDate)
      return [{ key, label: key === "today" ? "Today" : key === "yesterday" ? "Yesterday" : "Earlier" }]
    }
    case "starred": return [{ key: String(thread.starred), label: thread.starred ? "Starred" : "Not starred" }]
    case "important":
    case "priority": return [{ key: String(indexed.important), label: indexed.important ? "Important" : "Not important" }]
    case "unread": return [{ key: String(thread.unread), label: thread.unread ? "Unread" : "Read" }]
    case "from": {
      const sender = indexed.from[0]
      return [{ key: sender?.address.toLowerCase() ?? "empty", label: sender?.name || sender?.address || "No sender" }]
    }
    case "email_domain": {
      const address = indexed.from[0]?.address ?? ""
      const domain = address.split("@")[1]?.toLowerCase() || "empty"
      return [{ key: domain, label: domain === "empty" ? "No domain" : domain }]
    }
    case "labels": return thread.labelIds.length
      ? thread.labelIds.map((label) => ({ key: label, label }))
      : [{ key: "empty", label: "No label" }]
    default: {
      const value = indexed.customValues[group.propertyId]
      const values = Array.isArray(value) ? value : [value]
      const present = values.filter((item): item is string | number | boolean => ["string", "number", "boolean"].includes(typeof item))
      return present.length
        ? present.map((item) => ({ key: String(item), label: String(item) }))
        : [{ key: "empty", label: "Empty" }]
    }
  }
}

function dateGroupKey(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return "today"
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  return date.toDateString() === yesterday.toDateString() ? "yesterday" : "earlier"
}

function isMutableGroup(propertyId: string) {
  return !["date", "received_date", "from", "email_domain"].includes(propertyId)
}

function groupOrder(group: MailGroupConfig, left: MailQueryGroup, right: MailQueryGroup) {
  const dateOrder = ["today", "yesterday", "earlier"]
  const leftDate = dateOrder.indexOf(left.key)
  const rightDate = dateOrder.indexOf(right.key)
  const result = leftDate >= 0 && rightDate >= 0
    ? leftDate - rightDate
    : left.label.localeCompare(right.label)
  return group.direction === "descending" ? result : -result
}

async function loadCustomValues(bindingId: string, threadIds: string[]) {
  const result = new Map<string, Record<string, MailThreadPropertyValue["value"]>>()
  if (!threadIds.length) return result
  const rows = await db
    .select({
      gmailThreadId: mailThreadPropertyValue.gmailThreadId,
      propertyId: mailThreadPropertyValue.propertyId,
      value: mailThreadPropertyValue.value,
    })
    .from(mailThreadPropertyValue)
    .innerJoin(mailProperty, eq(mailProperty.id, mailThreadPropertyValue.propertyId))
    .where(and(
      eq(mailProperty.bindingId, bindingId),
      inArray(mailThreadPropertyValue.gmailThreadId, threadIds),
    ))
  for (const row of rows) {
    const values = result.get(row.gmailThreadId) ?? {}
    values[row.propertyId] = row.value as MailThreadPropertyValue["value"]
    result.set(row.gmailThreadId, values)
  }
  return result
}
