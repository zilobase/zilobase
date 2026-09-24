import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { softDeleteColumns } from "./soft-delete-columns";
import { page } from "./pages";
import { timestampColumns } from "./columns";

export const pageProperty = pgTable(
  "page_property",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    config: jsonb("config"),
    ...softDeleteColumns(),
  },
  (table) => [
    index("page_property_workspace_deleted_idx").on(table.workspaceId, table.deletedAt),
    index("page_property_deleted_at_idx").on(table.deletedAt),
  ],
);

export const pagePropertyValue = pgTable(
  "page_property_value",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => pageProperty.id, { onDelete: "cascade" }),
    value: jsonb("value"),
    ...timestampColumns(),
  },
  (table) => [
    index("page_property_value_property_id_idx").on(table.propertyId),
    uniqueIndex("page_property_value_unique").on(table.pageId, table.propertyId),
  ],
);
