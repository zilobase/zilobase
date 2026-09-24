import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import {
  evaluateMailFilterExpression,
  type MailFilterRecord,
} from "@zilobase/features/mail/predicate";
import {
  mailSystemFolderIds,
  normalizeMailFilterExpression,
  normalizeMailViewConfig,
  type MailFilterExpression,
  type MailGroupConfig,
  type MailIndexedThread,
  type MailQueryGroup,
  type MailSystemFolderId,
  type MailThreadPropertyValue,
  type MailViewQueryResponse,
  type MailViewConfig,
  type MailViewGroupsResponse,
} from "@zilobase/features/mail/organization";
import { type MailAddress, type MailThreadSummary } from "@zilobase/features/mail/contracts";

import { db } from "../../../infrastructure/database";
import {
  mailIndexState,
  mailProperty,
  mailThreadIndex,
  mailThreadPropertyValue,
  mailView,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import { getMailIndexProgress } from "../sync/mailbox-sync-engine";

const QUERY_BATCH_SIZE = 200;
const MAX_QUERY_BATCHES = 40;

type Cursor = { id: string; internalDate: number };

export class MailQueryError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
    this.name = "MailQueryError";
  }
}

export async function queryIndexedMail(input: {
  bindingId: string;
  cursor?: string;
  env: RuntimeEnv;
  filter?: MailFilterExpression;
  gmailAccountId: string;
  groupKey?: string;
  limit?: number;
  routeId: string;
  search?: string;
}): Promise<MailViewQueryResponse> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  let cursor = input.cursor ? decodeMailQueryCursor(input.cursor) : null;
  const routeConfig = await configForRoute(input.bindingId, input.routeId);
  const routeFilter = routeConfig?.filter ?? mailboxFilter(input.routeId as MailSystemFolderId);
  const filter = input.filter ? normalizeMailFilterExpression(input.filter) : routeFilter;
  const index = await getMailIndexProgress(input.gmailAccountId);
  const search = input.search?.trim() ?? "";
  if (search) {
    return searchIndexedMail({
      bindingId: input.bindingId,
      cursor,
      env: input.env,
      filter,
      gmailAccountId: input.gmailAccountId,
      group: routeConfig?.group ?? null,
      groupKey: input.groupKey,
      index,
      limit,
      search,
    });
  }
  const threads: MailIndexedThread[] = [];
  let nextCursor: string | null = null;

  for (let batchNumber = 0; batchNumber < MAX_QUERY_BATCHES; batchNumber += 1) {
    const rows = await db
      .select()
      .from(mailThreadIndex)
      .where(
        and(
          eq(mailThreadIndex.gmailAccountId, input.gmailAccountId),
          ...(cursor
            ? [
                or(
                  lt(mailThreadIndex.internalDate, cursor.internalDate),
                  and(
                    eq(mailThreadIndex.internalDate, cursor.internalDate),
                    lt(mailThreadIndex.id, cursor.id),
                  ),
                )!,
              ]
            : []),
        ),
      )
      .orderBy(desc(mailThreadIndex.internalDate), desc(mailThreadIndex.id))
      .limit(QUERY_BATCH_SIZE);

    if (!rows.length) {
      nextCursor = null;
      break;
    }
    const customValues = await loadCustomValues(
      input.bindingId,
      rows.map((row) => row.gmailThreadId),
    );
    for (const row of rows) {
      cursor = { id: row.id, internalDate: row.internalDate };
      const indexed = serializeIndexedThread(row, customValues.get(row.gmailThreadId));
      if (
        evaluateMailFilterExpression(indexedFilterRecord(indexed), filter) &&
        (!input.groupKey || groupKeys(indexed, routeConfig?.group ?? null).includes(input.groupKey))
      ) {
        threads.push(indexed);
      }
      if (threads.length >= limit) break;
    }
    nextCursor = cursor ? encodeMailQueryCursor(cursor) : null;
    if (threads.length >= limit) break;
    if (rows.length < QUERY_BATCH_SIZE) {
      nextCursor = null;
      break;
    }
  }

  return {
    index,
    nextCursor,
    searchTruncated: false,
    threads,
  };
}

export async function queryIndexedMailGroups(input: {
  bindingId: string;
  env: RuntimeEnv;
  filter?: MailFilterExpression;
  gmailAccountId: string;
  routeId: string;
  search?: string;
}): Promise<MailViewGroupsResponse> {
  const config = await configForRoute(input.bindingId, input.routeId);
  const index = await getMailIndexProgress(input.gmailAccountId);
  if (!config?.group) return { group: null, groups: [], index };
  const filter = input.filter ? normalizeMailFilterExpression(input.filter) : config.filter;
  const search = input.search?.trim() ?? "";
  const rows = await db
    .select()
    .from(mailThreadIndex)
    .where(
      and(
        eq(mailThreadIndex.gmailAccountId, input.gmailAccountId),
        ...(search ? [mailSearchPredicate(search)] : []),
      ),
    )
    .orderBy(desc(mailThreadIndex.internalDate), desc(mailThreadIndex.id));
  const customValues = await loadCustomValues(
    input.bindingId,
    rows.map((row) => row.gmailThreadId),
  );
  const counts = new Map<string, { count: number; label: string }>();
  for (const row of rows) {
    const indexed = serializeIndexedThread(row, customValues.get(row.gmailThreadId));
    if (!evaluateMailFilterExpression(indexedFilterRecord(indexed), filter)) continue;
    for (const { key, label } of groupEntries(indexed, config.group)) {
      const current = counts.get(key);
      counts.set(key, { count: (current?.count ?? 0) + 1, label });
    }
  }
  const mutable = isMutableGroup(config.group.propertyId);
  const groups: MailQueryGroup[] = [...counts.entries()]
    .map(([key, value]) => ({
      count: value.count,
      cursor: encodeMailGroupCursor(key),
      key,
      label: value.label,
      mutable,
    }))
    .sort((left, right) => groupOrder(config.group!, left, right));
  return { group: config.group, groups, index };
}

export function encodeMailQueryCursor(cursor: Cursor) {
  return btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function decodeMailQueryCursor(value: string): Cursor {
  try {
    if (!/^[A-Za-z0-9_-]{1,500}$/.test(value)) throw new Error();
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    ) as Record<string, unknown>;
    if (
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.internalDate !== "number" ||
      !Number.isSafeInteger(parsed.internalDate)
    )
      throw new Error();
    return { id: parsed.id, internalDate: parsed.internalDate };
  } catch {
    throw new MailQueryError("The mail query cursor is invalid.", 400);
  }
}

export function encodeMailGroupCursor(groupKey: string) {
  return btoa(JSON.stringify({ groupKey }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

async function configForRoute(bindingId: string, routeId: string): Promise<MailViewConfig | null> {
  if (mailSystemFolderIds.includes(routeId as MailSystemFolderId)) {
    return null;
  }
  const [view] = await db
    .select({ config: mailView.config })
    .from(mailView)
    .where(and(eq(mailView.bindingId, bindingId), eq(mailView.id, routeId)))
    .limit(1);
  if (!view) throw new MailQueryError("Mail view not found.", 404);
  return normalizeMailViewConfig(view.config);
}

function mailboxFilter(folderId: MailSystemFolderId): MailFilterExpression {
  return {
    filters: [
      {
        id: `system-${folderId}`,
        operator: "is",
        propertyId: "mailbox",
        type: "condition",
        values: [folderId],
      },
    ],
    id: "system-root",
    operator: "and",
    type: "group",
  };
}

async function searchIndexedMail(input: {
  bindingId: string;
  cursor: Cursor | null;
  env: RuntimeEnv;
  filter: MailFilterExpression;
  gmailAccountId: string;
  group: MailGroupConfig | null;
  groupKey?: string;
  index: MailViewQueryResponse["index"];
  limit: number;
  search: string;
}): Promise<MailViewQueryResponse> {
  const rows = await db
    .select()
    .from(mailThreadIndex)
    .where(
      and(
        eq(mailThreadIndex.gmailAccountId, input.gmailAccountId),
        mailSearchPredicate(input.search),
        ...(input.cursor
          ? [
              or(
                lt(mailThreadIndex.internalDate, input.cursor.internalDate),
                and(
                  eq(mailThreadIndex.internalDate, input.cursor.internalDate),
                  lt(mailThreadIndex.id, input.cursor.id),
                ),
              )!,
            ]
          : []),
      ),
    )
    .orderBy(desc(mailThreadIndex.internalDate), desc(mailThreadIndex.id))
    .limit(Math.max(input.limit * 4, QUERY_BATCH_SIZE));
  const customValues = await loadCustomValues(
    input.bindingId,
    rows.map((row) => row.gmailThreadId),
  );
  const indexedMatches: MailIndexedThread[] = [];
  let lastIndexed: Cursor | null = null;
  let exhausted = rows.length < Math.max(input.limit * 4, QUERY_BATCH_SIZE);
  for (const row of rows) {
    const indexed = serializeIndexedThread(row, customValues.get(row.gmailThreadId));
    if (!mailThreadMatchesQuery(indexed, input.filter, input.group, input.groupKey)) continue;
    if (indexedMatches.length >= input.limit) {
      exhausted = false;
      break;
    }
    indexedMatches.push(indexed);
    lastIndexed = { id: row.id, internalDate: row.internalDate };
  }
  return {
    index: input.index,
    nextCursor: exhausted || !lastIndexed ? null : encodeMailQueryCursor(lastIndexed),
    searchTruncated: input.index.status !== "ready",
    threads: indexedMatches,
  };
}

function mailThreadMatchesQuery(
  indexed: MailIndexedThread,
  filter: MailFilterExpression,
  group: MailGroupConfig | null,
  groupKey?: string,
) {
  return (
    evaluateMailFilterExpression(indexedFilterRecord(indexed), filter) &&
    (!groupKey || groupKeys(indexed, group).includes(groupKey))
  );
}

function mailSearchPredicate(search: string) {
  const parsed = parseMailSearch(search);
  const predicates = parsed.terms.length
    ? [
        sql`to_tsvector('simple', ${mailThreadIndex.searchDocument}) @@ websearch_to_tsquery('simple', ${parsed.terms.join(" ")})`,
      ]
    : [];
  for (const operator of parsed.operators) {
    const value = operator.value.toLowerCase();
    if (operator.name === "from")
      predicates.push(sql`${mailThreadIndex.fromAddresses}::text ilike ${`%${value}%`}`);
    else if (operator.name === "to")
      predicates.push(sql`${mailThreadIndex.toAddresses}::text ilike ${`%${value}%`}`);
    else if (operator.name === "subject")
      predicates.push(sql`${mailThreadIndex.subject} ilike ${`%${operator.value}%`}`);
    else if (operator.name === "has" && value === "attachment")
      predicates.push(sql`${mailThreadIndex.attachmentCount} > 0`);
    else if (operator.name === "is" && value === "unread")
      predicates.push(eq(mailThreadIndex.unread, true));
    else if (operator.name === "is" && value === "read")
      predicates.push(eq(mailThreadIndex.unread, false));
    else if (operator.name === "is" && value === "starred")
      predicates.push(eq(mailThreadIndex.starred, true));
    else if (operator.name === "is" && value === "important")
      predicates.push(eq(mailThreadIndex.important, true));
    else if (operator.name === "in" && searchLabel(value))
      predicates.push(sql`${mailThreadIndex.labelIds} ? ${searchLabel(value)!}`);
    else if ((operator.name === "before" || operator.name === "after") && searchDate(value)) {
      const date = searchDate(value)!;
      predicates.push(
        operator.name === "before"
          ? sql`${mailThreadIndex.internalDate} < ${date}`
          : sql`${mailThreadIndex.internalDate} >= ${date}`,
      );
    }
  }
  return and(...predicates) ?? sql`true`;
}

export function parseMailSearch(search: string) {
  const terms: string[] = [];
  const operators: { name: string; value: string }[] = [];
  const token = /(\w+):(?:"([^"]+)"|(\S+))|"([^"]+)"|(\S+)/g;
  for (const match of search.matchAll(token)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3];
    if (
      name &&
      value &&
      ["after", "before", "from", "has", "in", "is", "subject", "to"].includes(name)
    )
      operators.push({ name, value });
    else terms.push(match[4] ?? match[5] ?? match[0]);
  }
  return { operators, terms };
}

function searchLabel(value: string) {
  const labels = {
    all: null,
    drafts: "DRAFT",
    inbox: "INBOX",
    sent: "SENT",
    spam: "SPAM",
    starred: "STARRED",
    trash: "TRASH",
  } as const;
  return labels[value as keyof typeof labels];
}

function searchDate(value: string) {
  if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)) return null;
  const time = new Date(`${value.replaceAll("/", "-")}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time : null;
}

function serializeIndexedThread(
  row: typeof mailThreadIndex.$inferSelect,
  customValues: Record<string, MailThreadPropertyValue["value"]> = {},
): MailIndexedThread {
  const from = addresses(row.fromAddresses);
  const to = addresses(row.toAddresses);
  const cc = addresses(row.ccAddresses);
  const bcc = addresses(row.bccAddresses);
  const thread: MailThreadSummary = {
    attachmentCount: row.attachmentCount,
    id: row.gmailThreadId,
    internalDate: row.internalDate,
    labelIds: row.labelIds,
    latestMessageId: row.latestMessageId,
    messageCount: row.messageCount,
    messageIds: row.messageIds,
    participants: uniqueAddresses([...from, ...to]),
    snippet: row.snippet,
    starred: row.starred,
    subject: row.subject,
    unread: row.unread,
  };
  return {
    bcc,
    cc,
    customValues,
    from,
    hasCalendarEvent: row.hasCalendarEvent,
    important: row.important,
    thread,
    to,
  };
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
  };
}

function addresses(value: unknown): MailAddress[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MailAddress[] => {
    if (!item || typeof item !== "object") return [];
    const address = (item as { address?: unknown }).address;
    const name = (item as { name?: unknown }).name;
    return typeof address === "string"
      ? [{ address, name: typeof name === "string" ? name : null }]
      : [];
  });
}

function uniqueAddresses(items: MailAddress[]) {
  const seen = new Set<string>();
  return items.filter(({ address }) => {
    if (seen.has(address)) return false;
    seen.add(address);
    return true;
  });
}

function groupKeys(indexed: MailIndexedThread, group: MailGroupConfig | null) {
  return group ? groupEntries(indexed, group).map(({ key }) => key) : [];
}

function groupEntries(
  indexed: MailIndexedThread,
  group: MailGroupConfig,
): Array<{ key: string; label: string }> {
  const thread = indexed.thread;
  switch (group.propertyId) {
    case "date":
    case "received_date": {
      const key = dateGroupKey(thread.internalDate);
      return [
        { key, label: key === "today" ? "Today" : key === "yesterday" ? "Yesterday" : "Earlier" },
      ];
    }
    case "starred":
      return [
        { key: String(thread.starred), label: thread.starred ? "Starred" : "Everything else" },
      ];
    case "important":
    case "priority":
      return [
        {
          key: String(indexed.important),
          label: indexed.important ? "Important" : "Not important",
        },
      ];
    case "unread":
      return [{ key: String(thread.unread), label: thread.unread ? "Unread" : "Read" }];
    case "from": {
      const sender = indexed.from[0];
      return [
        {
          key: sender?.address.toLowerCase() ?? "empty",
          label: sender?.name || sender?.address || "No sender",
        },
      ];
    }
    case "email_domain": {
      const address = indexed.from[0]?.address ?? "";
      const domain = address.split("@")[1]?.toLowerCase() || "empty";
      return [{ key: domain, label: domain === "empty" ? "No domain" : domain }];
    }
    case "labels":
      return thread.labelIds.length
        ? thread.labelIds.map((label) => ({ key: label, label }))
        : [{ key: "empty", label: "No label" }];
    default: {
      const value = indexed.customValues[group.propertyId];
      const values = Array.isArray(value) ? value : [value];
      const present = values.filter((item): item is string | number | boolean =>
        ["string", "number", "boolean"].includes(typeof item),
      );
      return present.length
        ? present.map((item) => ({ key: String(item), label: String(item) }))
        : [{ key: "empty", label: "Empty" }];
    }
  }
}

function dateGroupKey(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === yesterday.toDateString() ? "yesterday" : "earlier";
}

function isMutableGroup(propertyId: string) {
  return !["date", "received_date", "from", "email_domain"].includes(propertyId);
}

function groupOrder(group: MailGroupConfig, left: MailQueryGroup, right: MailQueryGroup) {
  if (group.propertyId === "starred") {
    return Number(right.key === "true") - Number(left.key === "true");
  }
  const dateOrder = ["today", "yesterday", "earlier"];
  const leftDate = dateOrder.indexOf(left.key);
  const rightDate = dateOrder.indexOf(right.key);
  const result =
    leftDate >= 0 && rightDate >= 0 ? leftDate - rightDate : left.label.localeCompare(right.label);
  return group.direction === "descending" ? result : -result;
}

async function loadCustomValues(bindingId: string, threadIds: string[]) {
  const result = new Map<string, Record<string, MailThreadPropertyValue["value"]>>();
  if (!threadIds.length) return result;
  const rows = await db
    .select({
      gmailThreadId: mailThreadPropertyValue.gmailThreadId,
      propertyId: mailThreadPropertyValue.propertyId,
      value: mailThreadPropertyValue.value,
    })
    .from(mailThreadPropertyValue)
    .innerJoin(mailProperty, eq(mailProperty.id, mailThreadPropertyValue.propertyId))
    .where(
      and(
        eq(mailProperty.bindingId, bindingId),
        inArray(mailThreadPropertyValue.gmailThreadId, threadIds),
      ),
    );
  for (const row of rows) {
    const values = result.get(row.gmailThreadId) ?? {};
    values[row.propertyId] = row.value as MailThreadPropertyValue["value"];
    result.set(row.gmailThreadId, values);
  }
  return result;
}
