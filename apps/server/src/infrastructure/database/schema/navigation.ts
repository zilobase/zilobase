import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./authentication";
import { page } from "./pages";
import { database } from "./databases";
import { workspace } from "./workspaces";
import { timestampColumns } from "./columns";

export const favorite = pgTable(
  "favorites",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => page.id, {
      onDelete: "cascade",
    }),
    databaseId: text("database_id").references(() => database.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("favorites_page_id_idx").on(table.pageId),
    index("favorites_database_id_idx").on(table.databaseId),
    uniqueIndex("favorites_user_page_unique").on(table.userId, table.pageId),
    uniqueIndex("favorites_user_database_unique").on(table.userId, table.databaseId),
  ],
);

export const itemVisit = pgTable(
  "item_visit",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    itemKind: text("item_kind").notNull(),
    itemId: text("item_id").notNull(),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("item_visit_workspace_id_idx").on(table.workspaceId),
    index("item_visit_user_workspace_idx").on(table.userId, table.workspaceId),
    index("item_visit_item_idx").on(table.itemKind, table.itemId),
    uniqueIndex("item_visit_user_item_unique").on(table.userId, table.itemKind, table.itemId),
  ],
);

export const navigationRealtimeOutbox = pgTable(
  "navigation_realtime_outbox",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("navigation_realtime_outbox_ready_idx").on(table.nextAttemptAt, table.committedAt),
    index("navigation_realtime_outbox_workspace_idx").on(table.workspaceId, table.committedAt),
  ],
);
