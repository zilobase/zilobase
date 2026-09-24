import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { gmailWorkspaceConnection } from "./mail-connections";
import { timestampColumns } from "./columns";

export const mailView = pgTable(
  "mail_view",
  {
    id: text("id").primaryKey(),
    bindingId: text("binding_id")
      .notNull()
      .references(() => gmailWorkspaceConnection.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    templateId: text("template_id"),
    protected: boolean("protected").notNull().default(false),
    position: integer("position").notNull(),
    config: jsonb("config").notNull().default({}),
    ...timestampColumns(),
  },
  (table) => [
    index("mail_view_binding_position_idx").on(table.bindingId, table.position),
    index("mail_view_binding_updated_idx").on(table.bindingId, table.updatedAt),
  ],
);

export const mailProperty = pgTable(
  "mail_property",
  {
    id: text("id").primaryKey(),
    bindingId: text("binding_id")
      .notNull()
      .references(() => gmailWorkspaceConnection.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    options: jsonb("options").notNull().default([]),
    ...timestampColumns(),
  },
  (table) => [
    index("mail_property_binding_created_idx").on(table.bindingId, table.createdAt),
    check(
      "mail_property_type_check",
      sql`${table.type} in ('text', 'number', 'select', 'multi_select', 'status', 'date', 'person', 'checkbox', 'url', 'files')`,
    ),
  ],
);

export const mailThreadPropertyValue = pgTable(
  "mail_thread_property_value",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id")
      .notNull()
      .references(() => mailProperty.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    value: jsonb("value"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_thread_property_value_property_thread_unique").on(
      table.propertyId,
      table.gmailThreadId,
    ),
    index("mail_thread_property_value_thread_idx").on(table.gmailThreadId),
  ],
);

export const mailReminder = pgTable(
  "mail_reminder",
  {
    id: text("id").primaryKey(),
    bindingId: text("binding_id")
      .notNull()
      .references(() => gmailWorkspaceConnection.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    firedAt: timestamp("fired_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_reminder_binding_thread_unique").on(table.bindingId, table.gmailThreadId),
    index("mail_reminder_due_idx").on(table.status, table.remindAt),
    check("mail_reminder_status_check", sql`${table.status} in ('pending', 'fired', 'cancelled')`),
  ],
);
