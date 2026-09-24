import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type {
  MailAddress,
  MailLabelRecord,
  MailMessageRecord,
  MailThreadSummary,
} from "@zilobase/features/mail/contracts";

import { db } from "../../../infrastructure/database";
import {
  mailIndexState,
  mailLabel,
  mailMessage,
  mailThreadIndex,
} from "../../../infrastructure/database/schema";
import type { GmailMessage, GmailPart, GmailThread } from "../provider/gmail-gateway";
import {
  normalizeGmailLabels,
  normalizeGmailMessage,
  normalizeGmailThread,
} from "../provider/mail-normalize";

export async function storeMailboxThread(
  gmailAccountId: string,
  generation: number,
  thread: GmailThread,
  includeBody = true,
) {
  const normalized = normalizeGmailThread(thread, includeBody);
  const row = mailThreadIndexRecord(gmailAccountId, generation, thread, includeBody);
  await db.transaction(async (transaction) => {
    await transaction
      .insert(mailThreadIndex)
      .values(row)
      .onConflictDoUpdate({
        set: threadUpdate(row),
        target: [mailThreadIndex.gmailAccountId, mailThreadIndex.gmailThreadId],
      });
    for (const message of normalized.messages) {
      const record = mailMessageRecord(gmailAccountId, generation, message);
      await transaction
        .insert(mailMessage)
        .values(record)
        .onConflictDoUpdate({
          set: messageUpdate(record),
          target: [mailMessage.gmailAccountId, mailMessage.gmailMessageId],
        });
    }
    const ids = normalized.messages.map((message) => message.id);
    const predicate = and(
      eq(mailMessage.gmailAccountId, gmailAccountId),
      eq(mailMessage.gmailThreadId, normalized.summary.id),
      ...(ids.length ? [notInArray(mailMessage.gmailMessageId, ids)] : []),
    );
    if (predicate) await transaction.delete(mailMessage).where(predicate);
  });
  return row;
}

export async function storeMailboxMessage(
  gmailAccountId: string,
  generation: number,
  message: GmailMessage,
) {
  const normalized = normalizeGmailMessage(message, true);
  const record = mailMessageRecord(gmailAccountId, generation, normalized);
  await db
    .insert(mailMessage)
    .values(record)
    .onConflictDoUpdate({
      set: messageUpdate(record),
      target: [mailMessage.gmailAccountId, mailMessage.gmailMessageId],
    });
  await rebuildMailboxThread(gmailAccountId, normalized.threadId);
  return normalized;
}

export async function mailboxMessageExists(gmailAccountId: string, gmailMessageId: string) {
  const [stored] = await db
    .select({ id: mailMessage.id })
    .from(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, gmailAccountId),
        eq(mailMessage.gmailMessageId, gmailMessageId),
      ),
    )
    .limit(1);
  return Boolean(stored);
}

export async function mailboxThreadIsComplete(gmailAccountId: string, gmailThreadId: string) {
  const [stored] = await db
    .select({ hydrationStatus: mailThreadIndex.hydrationStatus })
    .from(mailThreadIndex)
    .where(
      and(
        eq(mailThreadIndex.gmailAccountId, gmailAccountId),
        eq(mailThreadIndex.gmailThreadId, gmailThreadId),
      ),
    )
    .limit(1);
  return stored?.hydrationStatus === "complete";
}

export async function replaceMailboxLabels(
  gmailAccountId: string,
  labels: Parameters<typeof normalizeGmailLabels>[0],
) {
  const normalized = normalizeGmailLabels(labels);
  await db.transaction(async (transaction) => {
    await transaction.delete(mailLabel).where(eq(mailLabel.gmailAccountId, gmailAccountId));
    if (normalized.length) {
      await transaction.insert(mailLabel).values(
        normalized.map((label) => ({
          ...label,
          gmailAccountId,
          gmailLabelId: label.id,
          id: `${gmailAccountId}:${label.id}`,
        })),
      );
    }
  });
  return normalized;
}

export async function upsertMailboxLabel(gmailAccountId: string, label: MailLabelRecord) {
  const record = {
    ...label,
    gmailAccountId,
    gmailLabelId: label.id,
    id: `${gmailAccountId}:${label.id}`,
    updatedAt: new Date(),
  };
  await db
    .insert(mailLabel)
    .values(record)
    .onConflictDoUpdate({
      set: {
        color: record.color,
        labelListVisibility: record.labelListVisibility,
        messageListVisibility: record.messageListVisibility,
        messagesTotal: record.messagesTotal,
        messagesUnread: record.messagesUnread,
        name: record.name,
        threadsTotal: record.threadsTotal,
        threadsUnread: record.threadsUnread,
        type: record.type,
        updatedAt: record.updatedAt,
      },
      target: [mailLabel.gmailAccountId, mailLabel.gmailLabelId],
    });
}

export async function deleteMailboxLabel(gmailAccountId: string, gmailLabelId: string) {
  await db
    .delete(mailLabel)
    .where(
      and(eq(mailLabel.gmailAccountId, gmailAccountId), eq(mailLabel.gmailLabelId, gmailLabelId)),
    );
}

export async function applyMailboxLabelDelta(input: {
  addLabelIds?: string[];
  gmailAccountId: string;
  gmailMessageId: string;
  removeLabelIds?: string[];
}) {
  const [stored] = await db
    .select({ labelIds: mailMessage.labelIds, threadId: mailMessage.gmailThreadId })
    .from(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, input.gmailAccountId),
        eq(mailMessage.gmailMessageId, input.gmailMessageId),
      ),
    )
    .limit(1);
  if (!stored) return false;
  const labels = new Set(stored.labelIds);
  for (const label of input.addLabelIds ?? []) labels.add(label);
  for (const label of input.removeLabelIds ?? []) labels.delete(label);
  const nextLabels = [...labels];
  if (
    nextLabels.length === stored.labelIds.length &&
    nextLabels.every((label) => stored.labelIds.includes(label))
  )
    return false;
  await db
    .update(mailMessage)
    .set({ labelIds: nextLabels, updatedAt: new Date() })
    .where(
      and(
        eq(mailMessage.gmailAccountId, input.gmailAccountId),
        eq(mailMessage.gmailMessageId, input.gmailMessageId),
      ),
    );
  await rebuildMailboxThread(input.gmailAccountId, stored.threadId);
  return true;
}

export async function applyMailboxThreadLabelDelta(input: {
  addLabelIds?: string[];
  gmailAccountId: string;
  gmailThreadId: string;
  removeLabelIds?: string[];
}) {
  const messages = await db
    .select({ id: mailMessage.gmailMessageId })
    .from(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, input.gmailAccountId),
        eq(mailMessage.gmailThreadId, input.gmailThreadId),
      ),
    );
  let changed = false;
  for (const message of messages) {
    changed =
      (await applyMailboxLabelDelta({
        addLabelIds: input.addLabelIds,
        gmailAccountId: input.gmailAccountId,
        gmailMessageId: message.id,
        removeLabelIds: input.removeLabelIds,
      })) || changed;
  }
  return changed;
}

export async function deleteMailboxMessage(gmailAccountId: string, gmailMessageId: string) {
  const [stored] = await db
    .delete(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, gmailAccountId),
        eq(mailMessage.gmailMessageId, gmailMessageId),
      ),
    )
    .returning({ threadId: mailMessage.gmailThreadId });
  if (!stored) return false;
  await rebuildMailboxThread(gmailAccountId, stored.threadId);
  return true;
}

export async function deleteMailboxThread(gmailAccountId: string, gmailThreadId: string) {
  await db.transaction(async (transaction) => {
    await transaction
      .delete(mailMessage)
      .where(
        and(
          eq(mailMessage.gmailAccountId, gmailAccountId),
          eq(mailMessage.gmailThreadId, gmailThreadId),
        ),
      );
    await transaction
      .delete(mailThreadIndex)
      .where(
        and(
          eq(mailThreadIndex.gmailAccountId, gmailAccountId),
          eq(mailThreadIndex.gmailThreadId, gmailThreadId),
        ),
      );
  });
}

export async function loadMailboxThread(gmailAccountId: string, gmailThreadId: string) {
  const [thread] = await db
    .select()
    .from(mailThreadIndex)
    .where(
      and(
        eq(mailThreadIndex.gmailAccountId, gmailAccountId),
        eq(mailThreadIndex.gmailThreadId, gmailThreadId),
      ),
    )
    .limit(1);
  if (!thread) return null;
  const messages = await db
    .select()
    .from(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, gmailAccountId),
        eq(mailMessage.gmailThreadId, gmailThreadId),
      ),
    )
    .orderBy(mailMessage.internalDate);
  return {
    messages: messages.map(serializeMailboxMessage),
    summary: serializeMailboxThread(thread),
  };
}

export async function loadMailboxMessage(gmailAccountId: string, gmailMessageId: string) {
  const [message] = await db
    .select()
    .from(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, gmailAccountId),
        eq(mailMessage.gmailMessageId, gmailMessageId),
      ),
    )
    .limit(1);
  return message ? serializeMailboxMessage(message) : null;
}

export async function loadMailboxLabels(gmailAccountId: string): Promise<MailLabelRecord[]> {
  const labels = await db
    .select()
    .from(mailLabel)
    .where(eq(mailLabel.gmailAccountId, gmailAccountId))
    .orderBy(mailLabel.name);
  return labels.map((label) => ({
    color: label.color as MailLabelRecord["color"],
    id: label.gmailLabelId,
    labelListVisibility: label.labelListVisibility,
    messageListVisibility: label.messageListVisibility,
    messagesTotal: label.messagesTotal,
    messagesUnread: label.messagesUnread,
    name: label.name,
    threadsTotal: label.threadsTotal,
    threadsUnread: label.threadsUnread,
    type: label.type as MailLabelRecord["type"],
  }));
}

export async function loadMailboxUnsubscribeHeaders(gmailAccountId: string, gmailThreadId: string) {
  const [message] = await db
    .select({
      listUnsubscribe: mailMessage.listUnsubscribe,
      listUnsubscribePost: mailMessage.listUnsubscribePost,
    })
    .from(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, gmailAccountId),
        eq(mailMessage.gmailThreadId, gmailThreadId),
      ),
    )
    .orderBy(sql`${mailMessage.internalDate} desc`)
    .limit(1);
  return message ?? null;
}

export async function commitMailboxRevision(gmailAccountId: string) {
  const [state] = await db
    .update(mailIndexState)
    .set({
      committedRevision: sql`${mailIndexState.committedRevision} + 1`,
      lastSuccessAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mailIndexState.gmailAccountId, gmailAccountId))
    .returning({ revision: mailIndexState.committedRevision });
  return state?.revision ?? 0;
}

export function mailThreadIndexRecord(
  gmailAccountId: string,
  generation: number,
  thread: GmailThread,
  includeBody = false,
) {
  const { messages, summary } = normalizeGmailThread(thread, includeBody);
  const fromAddresses = uniqueAddresses(
    messages.flatMap((message) => (message.from ? [message.from] : [])),
  );
  const toAddresses = uniqueAddresses(messages.flatMap((message) => message.to));
  const ccAddresses = uniqueAddresses(messages.flatMap((message) => message.cc));
  const bccAddresses = uniqueAddresses(messages.flatMap((message) => message.bcc));
  const domains = [
    ...new Set(
      [...fromAddresses, ...toAddresses, ...ccAddresses, ...bccAddresses]
        .map(({ address }) => address.split("@")[1])
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ];
  const now = new Date();
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
    hydrationStatus: messages.every((message) => message.hasFullBody) ? "complete" : "partial",
    id: `${gmailAccountId}:${summary.id}`,
    important: summary.labelIds.includes("IMPORTANT"),
    internalDate: summary.internalDate,
    labelIds: summary.labelIds,
    latestMessageId: summary.latestMessageId,
    messageCount: summary.messageCount,
    messageIds: summary.messageIds,
    receivedAt: new Date(summary.internalDate),
    searchDocument: searchDocument(messages, summary),
    snippet: summary.snippet.slice(0, 500),
    starred: summary.starred,
    subject: summary.subject,
    toAddresses,
    unread: summary.unread,
    updatedAt: now,
  };
}

async function rebuildMailboxThread(gmailAccountId: string, gmailThreadId: string) {
  const messages = await db
    .select()
    .from(mailMessage)
    .where(
      and(
        eq(mailMessage.gmailAccountId, gmailAccountId),
        eq(mailMessage.gmailThreadId, gmailThreadId),
      ),
    )
    .orderBy(mailMessage.internalDate);
  if (!messages.length) {
    await db
      .delete(mailThreadIndex)
      .where(
        and(
          eq(mailThreadIndex.gmailAccountId, gmailAccountId),
          eq(mailThreadIndex.gmailThreadId, gmailThreadId),
        ),
      );
    return;
  }
  const normalized = messages.map(serializeMailboxMessage);
  const latest = normalized.at(-1)!;
  const labels = unique(normalized.flatMap((message) => message.labelIds));
  const fromAddresses = uniqueAddresses(
    normalized.flatMap((message) => (message.from ? [message.from] : [])),
  );
  const toAddresses = uniqueAddresses(normalized.flatMap((message) => message.to));
  const ccAddresses = uniqueAddresses(normalized.flatMap((message) => message.cc));
  const bccAddresses = uniqueAddresses(normalized.flatMap((message) => message.bcc));
  const domains = unique(
    [...fromAddresses, ...toAddresses, ...ccAddresses, ...bccAddresses].flatMap(({ address }) => {
      const domain = address.split("@")[1];
      return domain ? [domain] : [];
    }),
  );
  await db
    .update(mailThreadIndex)
    .set({
      attachmentCount: normalized.reduce((total, message) => total + message.attachmentCount, 0),
      bccAddresses,
      ccAddresses,
      domains,
      fromAddresses,
      hydrationStatus: normalized.every((message) => message.hasFullBody) ? "complete" : "partial",
      important: labels.includes("IMPORTANT"),
      internalDate: latest.internalDate,
      labelIds: labels,
      latestMessageId: latest.id,
      messageCount: normalized.length,
      messageIds: normalized.map((message) => message.id),
      receivedAt: new Date(latest.internalDate),
      searchDocument: searchDocument(normalized, {
        snippet: latest.snippet,
        subject: latest.subject,
      }),
      snippet: latest.snippet.slice(0, 500),
      starred: labels.includes("STARRED"),
      subject: latest.subject,
      toAddresses,
      unread: labels.includes("UNREAD"),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mailThreadIndex.gmailAccountId, gmailAccountId),
        eq(mailThreadIndex.gmailThreadId, gmailThreadId),
      ),
    );
}

function mailMessageRecord(gmailAccountId: string, generation: number, message: MailMessageRecord) {
  const now = new Date();
  return {
    attachmentCount: message.attachmentCount,
    attachments: message.attachments,
    bccAddresses: message.bcc,
    bodyHtml: message.bodyHtml,
    bodyText: message.bodyText,
    ccAddresses: message.cc,
    createdAt: now,
    draftId: message.draftId,
    fromAddress: message.from,
    generation,
    gmailAccountId,
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    hasFullBody: message.hasFullBody,
    historyId: message.historyId,
    id: `${gmailAccountId}:${message.id}`,
    inReplyTo: message.inReplyTo,
    internalDate: message.internalDate,
    labelIds: message.labelIds,
    listUnsubscribe: message.listUnsubscribe ?? null,
    listUnsubscribePost: message.listUnsubscribePost ?? null,
    messageDate: message.date,
    messageIdHeader: message.messageIdHeader,
    references: message.references,
    replyToAddress: message.replyTo,
    sizeEstimate: message.sizeEstimate,
    snippet: message.snippet,
    subject: message.subject,
    toAddresses: message.to,
    updatedAt: now,
  };
}

function threadUpdate(row: ReturnType<typeof mailThreadIndexRecord>) {
  const { createdAt: _createdAt, gmailAccountId: _account, id: _id, ...update } = row;
  return update;
}

function messageUpdate(row: ReturnType<typeof mailMessageRecord>) {
  const {
    createdAt: _createdAt,
    gmailAccountId: _account,
    gmailMessageId: _message,
    id: _id,
    ...update
  } = row;
  return update;
}

function serializeMailboxThread(row: typeof mailThreadIndex.$inferSelect): MailThreadSummary {
  return {
    attachmentCount: row.attachmentCount,
    id: row.gmailThreadId,
    internalDate: row.internalDate,
    labelIds: row.labelIds,
    latestMessageId: row.latestMessageId,
    messageCount: row.messageCount,
    messageIds: row.messageIds,
    participants: uniqueAddresses([...addresses(row.fromAddresses), ...addresses(row.toAddresses)]),
    snippet: row.snippet,
    starred: row.starred,
    subject: row.subject,
    unread: row.unread,
  };
}

function serializeMailboxMessage(row: typeof mailMessage.$inferSelect): MailMessageRecord {
  return {
    attachmentCount: row.attachmentCount,
    attachments: row.attachments as MailMessageRecord["attachments"],
    bcc: addresses(row.bccAddresses),
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyText,
    cc: addresses(row.ccAddresses),
    date: row.messageDate,
    draftId: row.draftId,
    from: address(row.fromAddress),
    hasFullBody: row.hasFullBody,
    historyId: row.historyId,
    id: row.gmailMessageId,
    inReplyTo: row.inReplyTo,
    internalDate: row.internalDate,
    labelIds: row.labelIds,
    listUnsubscribe: row.listUnsubscribe,
    listUnsubscribePost: row.listUnsubscribePost,
    messageIdHeader: row.messageIdHeader,
    references: row.references,
    replyTo: address(row.replyToAddress),
    sizeEstimate: row.sizeEstimate,
    snippet: row.snippet,
    subject: row.subject,
    threadId: row.gmailThreadId,
    to: addresses(row.toAddresses),
  };
}

function searchDocument(
  messages: MailMessageRecord[],
  summary: Pick<MailThreadSummary, "snippet" | "subject">,
) {
  return [
    summary.subject,
    summary.snippet,
    ...messages.flatMap((message) => [
      message.subject,
      message.snippet,
      message.bodyText ?? "",
      message.bodyHtml?.replace(/<[^>]*>/g, " ") ?? "",
      ...[message.from, message.replyTo, ...message.to, ...message.cc, ...message.bcc]
        .filter((item): item is MailAddress => Boolean(item))
        .flatMap(({ address, name }) => [address, name ?? ""]),
    ]),
  ].join(" ");
}

function hasCalendarPart(part: GmailPart | undefined): boolean {
  if (!part) return false;
  return part.mimeType === "text/calendar" || (part.parts ?? []).some(hasCalendarPart);
}

function addresses(value: unknown): MailAddress[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is MailAddress =>
          Boolean(item) && typeof item === "object" && typeof item.address === "string",
      )
    : [];
}

function address(value: unknown) {
  return addresses(value ? [value] : [])[0] ?? null;
}

function uniqueAddresses(addresses: MailAddress[]) {
  const seen = new Set<string>();
  return addresses.filter(({ address }) => {
    if (seen.has(address)) return false;
    seen.add(address);
    return true;
  });
}

function unique(values: string[]) {
  return [...new Set(values)];
}
