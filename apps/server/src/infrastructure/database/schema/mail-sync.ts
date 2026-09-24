import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { gmailWorkspaceConnection, gmailAccount } from "./mail-connections";
import { mailView } from "./mail-organization";
import { dataSource } from "./databases";
import { timestampColumns } from "./columns";

export const mailDatabaseSyncRecord = pgTable(
  "mail_database_sync_record",
  {
    id: text("id").primaryKey(),
    bindingId: text("binding_id")
      .notNull()
      .references(() => gmailWorkspaceConnection.id, { onDelete: "cascade" }),
    viewId: text("view_id")
      .notNull()
      .references(() => mailView.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    destinationDataSourceId: text("destination_data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "restrict" }),
    databaseRowId: text("database_row_id").notNull(),
    pageId: text("page_id").notNull(),
    status: text("status").notNull().default("active"),
    lastSourceUpdatedAt: timestamp("last_source_updated_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_database_sync_record_view_thread_unique").on(
      table.viewId,
      table.gmailThreadId,
    ),
    index("mail_database_sync_record_binding_idx").on(table.bindingId, table.updatedAt),
    index("mail_database_sync_record_destination_idx").on(
      table.destinationDataSourceId,
      table.databaseRowId,
    ),
    check("mail_database_sync_record_status_check", sql`${table.status} in ('active', 'paused')`),
  ],
);

export const mailDatabaseSyncOutbox = pgTable(
  "mail_database_sync_outbox",
  {
    id: text("id").primaryKey(),
    bindingId: text("binding_id")
      .notNull()
      .references(() => gmailWorkspaceConnection.id, { onDelete: "cascade" }),
    viewId: text("view_id")
      .notNull()
      .references(() => mailView.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    workerId: text("worker_id"),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_database_sync_outbox_view_thread_unique").on(
      table.viewId,
      table.gmailThreadId,
    ),
    index("mail_database_sync_outbox_ready_idx").on(table.status, table.nextAttemptAt),
    index("mail_database_sync_outbox_binding_idx").on(table.bindingId, table.updatedAt),
    index("mail_database_sync_outbox_active_due_idx")
      .on(table.nextAttemptAt, table.leaseExpiresAt, table.createdAt)
      .where(sql`${table.status} in ('pending', 'processing', 'retry')`),
    check(
      "mail_database_sync_outbox_status_check",
      sql`${table.status} in ('pending', 'processing', 'retry', 'completed', 'paused')`,
    ),
  ],
);

export const mailIndexState = pgTable(
  "mail_index_state",
  {
    gmailAccountId: text("gmail_account_id")
      .primaryKey()
      .references(() => gmailAccount.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    generation: integer("generation").notNull().default(0),
    indexedThreadCount: integer("indexed_thread_count").notNull().default(0),
    resultSizeEstimate: integer("result_size_estimate"),
    historyId: text("history_id"),
    appliedHistoryId: text("applied_history_id"),
    desiredHistoryId: text("desired_history_id"),
    bootstrapHistoryId: text("bootstrap_history_id"),
    historyStartId: text("history_start_id"),
    historyPageToken: text("history_page_token"),
    nextPageToken: text("next_page_token"),
    backfillCompleteAt: timestamp("backfill_complete_at", { withTimezone: true }),
    recentReadyAt: timestamp("recent_ready_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    committedRevision: integer("committed_revision").notNull().default(0),
    recordVersion: integer("record_version").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseToken: text("lease_token"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("mail_index_state_active_due_idx")
      .on(table.status, table.nextAttemptAt, table.leaseExpiresAt)
      .where(sql`${table.status} in ('pending', 'backfilling', 'syncing', 'error')`),
  ],
);

export const mailThreadIndex = pgTable(
  "mail_thread_index",
  {
    id: text("id").primaryKey(),
    gmailAccountId: text("gmail_account_id")
      .notNull()
      .references(() => gmailAccount.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    generation: integer("generation").notNull(),
    latestMessageId: text("latest_message_id").notNull(),
    messageIds: jsonb("message_ids").$type<string[]>().notNull().default([]),
    labelIds: jsonb("label_ids").$type<string[]>().notNull().default([]),
    fromAddresses: jsonb("from_addresses").notNull().default([]),
    toAddresses: jsonb("to_addresses").notNull().default([]),
    ccAddresses: jsonb("cc_addresses").notNull().default([]),
    bccAddresses: jsonb("bcc_addresses").notNull().default([]),
    domains: jsonb("domains").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull().default(""),
    internalDate: bigint("internal_date", { mode: "number" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    messageCount: integer("message_count").notNull(),
    attachmentCount: integer("attachment_count").notNull(),
    hasCalendarEvent: boolean("has_calendar_event").notNull().default(false),
    unread: boolean("unread").notNull().default(false),
    starred: boolean("starred").notNull().default(false),
    important: boolean("important").notNull().default(false),
    hydrationStatus: text("hydration_status").notNull().default("complete"),
    searchDocument: text("search_document").notNull().default(""),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_thread_index_account_thread_unique").on(
      table.gmailAccountId,
      table.gmailThreadId,
    ),
    index("mail_thread_index_account_date_idx").on(table.gmailAccountId, table.internalDate),
    index("mail_thread_index_account_unread_idx").on(table.gmailAccountId, table.unread),
    index("mail_thread_index_account_starred_idx").on(table.gmailAccountId, table.starred),
    check(
      "mail_thread_index_hydration_status_check",
      sql`${table.hydrationStatus} in ('partial', 'complete')`,
    ),
  ],
);

export const mailMessage = pgTable(
  "mail_message",
  {
    id: text("id").primaryKey(),
    gmailAccountId: text("gmail_account_id")
      .notNull()
      .references(() => gmailAccount.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    generation: integer("generation").notNull(),
    historyId: text("history_id").notNull().default("0"),
    draftId: text("draft_id"),
    internalDate: bigint("internal_date", { mode: "number" }).notNull(),
    messageDate: text("message_date"),
    labelIds: jsonb("label_ids").$type<string[]>().notNull().default([]),
    fromAddress: jsonb("from_address"),
    replyToAddress: jsonb("reply_to_address"),
    toAddresses: jsonb("to_addresses").notNull().default([]),
    ccAddresses: jsonb("cc_addresses").notNull().default([]),
    bccAddresses: jsonb("bcc_addresses").notNull().default([]),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull().default(""),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    hasFullBody: boolean("has_full_body").notNull().default(false),
    messageIdHeader: text("message_id_header"),
    inReplyTo: text("in_reply_to"),
    listUnsubscribe: text("list_unsubscribe"),
    listUnsubscribePost: text("list_unsubscribe_post"),
    references: jsonb("references").$type<string[]>().notNull().default([]),
    sizeEstimate: integer("size_estimate").notNull().default(0),
    attachmentCount: integer("attachment_count").notNull().default(0),
    attachments: jsonb("attachments").notNull().default([]),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_message_account_message_unique").on(
      table.gmailAccountId,
      table.gmailMessageId,
    ),
    index("mail_message_account_thread_idx").on(table.gmailAccountId, table.gmailThreadId),
    index("mail_message_account_date_idx").on(table.gmailAccountId, table.internalDate),
  ],
);

export const mailLabel = pgTable(
  "mail_label",
  {
    id: text("id").primaryKey(),
    gmailAccountId: text("gmail_account_id")
      .notNull()
      .references(() => gmailAccount.id, { onDelete: "cascade" }),
    gmailLabelId: text("gmail_label_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    color: jsonb("color"),
    labelListVisibility: text("label_list_visibility"),
    messageListVisibility: text("message_list_visibility"),
    messagesTotal: integer("messages_total"),
    messagesUnread: integer("messages_unread"),
    threadsTotal: integer("threads_total"),
    threadsUnread: integer("threads_unread"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_label_account_label_unique").on(table.gmailAccountId, table.gmailLabelId),
    index("mail_label_account_name_idx").on(table.gmailAccountId, table.name),
    check("mail_label_type_check", sql`${table.type} in ('system', 'user')`),
  ],
);

export const gmailApiBudget = pgTable(
  "gmail_api_budget",
  {
    googleSubject: text("google_subject").primaryKey(),
    availableUnits: integer("available_units").notNull().default(5000),
    refilledAt: timestamp("refilled_at", { withTimezone: true }).notNull().defaultNow(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    consecutiveQuotaFailures: integer("consecutive_quota_failures").notNull().default(0),
    ...timestampColumns(),
  },
  (table) => [index("gmail_api_budget_blocked_idx").on(table.blockedUntil)],
);
