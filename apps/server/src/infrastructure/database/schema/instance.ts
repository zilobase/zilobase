import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";

export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    registrationMode: text("registration_mode").notNull().default("invite-only"),
    pinnedWorkspaceId: text("pinned_workspace_id").references(() => workspace.id, {
      onDelete: "restrict",
    }),
    bootstrapCompletedAt: timestamp("bootstrap_completed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "instance_settings_registration_mode_check",
      sql`${table.registrationMode} in ('invite-only', 'open')`,
    ),
  ],
);
