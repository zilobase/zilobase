import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { user } from "./authentication";
import { databaseAutomation, databaseAutomationRun } from "./automations";
import { page } from "./pages";
import { timestampColumns } from "./columns";

export const inProductNotification = pgTable(
  "in_product_notification",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    automationId: text("automation_id").references(() => databaseAutomation.id, {
      onDelete: "set null",
    }),
    runId: text("run_id").references(() => databaseAutomationRun.id, {
      onDelete: "set null",
    }),
    actionId: text("action_id"),
    message: text("message").notNull(),
    pageId: text("page_id").references(() => page.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("in_product_notification_inbox_idx").on(table.workspaceId, table.userId, table.createdAt),
    index("in_product_notification_unread_idx").on(table.workspaceId, table.userId, table.readAt),
    uniqueIndex("in_product_notification_run_recipient_unique").on(
      table.runId,
      table.actionId,
      table.userId,
    ),
  ],
);

export const inProductNotificationOutbox = pgTable(
  "in_product_notification_outbox",
  {
    id: text("id").primaryKey(),
    notificationId: text("notification_id")
      .notNull()
      .references(() => inProductNotification.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("in_product_notification_outbox_notification_unique").on(table.notificationId),
    index("in_product_notification_outbox_due_idx").on(table.status, table.nextAttemptAt),
    index("in_product_notification_outbox_pending_due_idx")
      .on(table.nextAttemptAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      "in_product_notification_outbox_status_check",
      sql`${table.status} in ('pending', 'published', 'failed')`,
    ),
  ],
);
