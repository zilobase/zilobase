import { boolean, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./authentication";
import { timestampColumns } from "./columns";

export const pageSettings = pgTable(
  "page_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    embeddedItemsOpenAs: text("embedded_items_open_as").notNull().default("sidepanel"),
    pageFullWidth: boolean("page_full_width").notNull().default(false),
    sidebarConfig: jsonb("sidebar_config").notNull().default({}),
    ...timestampColumns(),
  },
  (table) => [uniqueIndex("page_settings_user_id_unique").on(table.userId)],
);
