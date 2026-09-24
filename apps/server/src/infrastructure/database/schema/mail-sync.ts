import { sql } from "drizzle-orm";
import { boolean, bigint, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
    uniqueIndex("mail_database_sync_record_view_thread_unique").on(table.viewId, table.gmailThreadId),
    index("mail_database_sync_record_binding_idx").on(table.bindingId, table.updatedAt),
    index("mail_database_sync_record_destination_idx").on(table.destinationDataSourceId, table.databaseRowId),
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
    uniqueIndex("mail_database_sync_outbox_view_thread_unique").on(table.viewId, table.gmailThreadId),
    index("mail_database_sync_outbox_ready_idx").on(table.status, table.nextAttemptAt),
    index("mail_database_sync_outbox_binding_idx").on(table.bindingId, table.updatedAt),
    index("mail_database_sync_outbox_active_due_idx")
      .on(table.nextAttemptAt, table.leaseExpiresAt, table.createdAt)
      .where(sql`${table.status} in ('pending', 'processing', 'retry')`),
    check("mail_database_sync_outbox_status_check", sql`${table.status} in ('pending', 'processing', 'retry', 'completed', 'paused')`),
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
    historyStartId: text("history_start_id"),
    historyPageToken: text("history_page_token"),
    nextPageToken: text("next_page_token"),
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
      .on(table.status, table.leaseExpiresAt, table.updatedAt)
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
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_thread_index_account_thread_unique").on(
      table.gmailAccountId,
      table.gmailThreadId,
    ),
    index("mail_thread_index_account_date_idx").on(
      table.gmailAccountId,
      table.internalDate,
    ),
    index("mail_thread_index_account_unread_idx").on(
      table.gmailAccountId,
      table.unread,
    ),
    index("mail_thread_index_account_starred_idx").on(
      table.gmailAccountId,
      table.starred,
    ),
  ],
);
