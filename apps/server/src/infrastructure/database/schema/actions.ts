import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./authentication";
import { workspace } from "./workspaces";

/** One operation of a workspace action call; replayed instead of re-executed on redelivery. */
export const workspaceActionReceipt = pgTable(
  "workspace_action_receipt",
  {
    invocationId: text("invocation_id").notNull(),
    callId: text("call_id").notNull(),
    opIndex: integer("op_index").notNull(),
    kind: text("kind").$type<"database" | "page">().notNull(),
    request: jsonb("request").notNull(),
    status: text("status").$type<"pending" | "completed">().notNull().default("pending"),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.invocationId, table.callId, table.opIndex] }),
    index("workspace_action_receipt_created_idx").on(table.createdAt),
  ],
);

/** A change made by a principal's action, with its inverse when undo needs no pre-image. */
export const workspaceActionChange = pgTable(
  "workspace_action_change",
  {
    id: text("id").primaryKey(),
    invocationId: text("invocation_id").notNull(),
    callId: text("call_id").notNull(),
    opIndex: integer("op_index").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"database" | "page">().notNull(),
    commandType: text("command_type").notNull(),
    databaseId: text("database_id"),
    dataSourceId: text("data_source_id"),
    summary: jsonb("summary").notNull(),
    inverse: jsonb("inverse"),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_action_change_invocation_idx").on(table.invocationId, table.opIndex),
    index("workspace_action_change_owner_idx").on(table.workspaceId, table.userId, table.createdAt),
  ],
);
