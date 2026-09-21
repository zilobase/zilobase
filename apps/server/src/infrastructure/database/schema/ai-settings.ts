import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { timestampColumns } from "./columns";
import { user } from "./authentication";

export const workspaceAiProviderConfig = pgTable(
  "workspace_ai_provider_config",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    credentialCiphertext: text("credential_ciphertext"),
    credentialIv: text("credential_iv"),
    credentialKeyVersion: text("credential_key_version"),
    credentialFingerprint: text("credential_fingerprint"),
    baseUrl: text("base_url"),
    modelIds: jsonb("model_ids").$type<string[]>().notNull().default([]),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("workspace_ai_provider_config_provider_idx").on(
      table.workspaceId,
      table.providerId,
    ),
  ],
);

export const aiSettings = pgTable("ai_settings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  definition: jsonb("definition").notNull(),
  version: integer("version").notNull().default(1),
  ...timestampColumns(),
}, (t) => [uniqueIndex("ai_settings_scope_unique").on(t.workspaceId, t.scope)]);

export const aiSettingsDraft = pgTable("ai_settings_draft", {
  id: text("id").primaryKey(),
  settingsId: text("settings_id").notNull().references(() => aiSettings.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  definition: jsonb("definition").notNull(),
  baseVersion: integer("base_version").notNull(),
  draftVersion: integer("draft_version").notNull().default(1),
  review: jsonb("review"),
  pendingRun: text("pending_run"),
  ...timestampColumns(),
}, (t) => [uniqueIndex("ai_settings_draft_editor_unique").on(t.settingsId, t.userId)]);

export const aiSettingsVersion = pgTable("ai_settings_version", {
  id: text("id").primaryKey(),
  settingsId: text("settings_id").notNull().references(() => aiSettings.id, { onDelete: "cascade" }),
  definition: jsonb("definition").notNull(),
  version: integer("version").notNull(),
  createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("ai_settings_version_unique").on(t.settingsId, t.version)]);
