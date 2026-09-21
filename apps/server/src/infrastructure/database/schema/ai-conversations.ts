import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { user } from "./authentication";
import { timestampColumns } from "./columns";

export const aiChatThread = pgTable(
  "ai_chat_thread",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    nextMessageSequence: integer("next_message_sequence").notNull().default(0),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestampColumns(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_chat_thread_workspace_user_activity_idx").on(
      table.workspaceId,
      table.userId,
      table.deletedAt,
      table.lastActivityAt,
    ),
    index("ai_chat_thread_workspace_user_archived_activity_idx").on(
      table.workspaceId,
      table.userId,
      table.archivedAt,
      table.deletedAt,
      table.lastActivityAt,
    ),
  ],
);

export const aiChatMessage = pgTable(
  "ai_chat_message",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id"),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull().default([]),
    sequence: integer("sequence").notNull().default(0),
    status: text("status").notNull().default("completed"),
    turnId: text("turn_id"),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_chat_message_thread_created_idx").on(table.threadId, table.createdAt),
    uniqueIndex("ai_chat_message_thread_client_unique").on(
      table.threadId,
      table.clientId,
    ),
    uniqueIndex("ai_chat_message_thread_sequence_unique").on(
      table.threadId,
      table.sequence,
    ),
    check(
      "ai_chat_message_status_check",
      sql`${table.status} in ('completed', 'failed', 'cancelled')`,
    ),
  ],
);

export const aiChatThreadSummary = pgTable(
  "ai_chat_thread_summary",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    coveredThroughSequence: integer("covered_through_sequence").notNull(),
    summary: text("summary").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_chat_thread_summary_thread_unique").on(table.threadId),
  ],
);

export const aiChatFeedback = pgTable(
  "ai_chat_feedback",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => aiChatMessage.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    reason: text("reason"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_chat_feedback_user_message_unique").on(
      table.userId,
      table.messageId,
    ),
    index("ai_chat_feedback_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    check("ai_chat_feedback_rating_check", sql`${table.rating} in (-1, 1)`),
  ],
);
