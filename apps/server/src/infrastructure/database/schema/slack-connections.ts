import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./authentication";
import { workspace } from "./workspaces";
import { timestampColumns } from "./columns";

export const slackOauthAttempt = pgTable(
  "slack_oauth_attempt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    stateHash: text("state_hash").notNull(),
    codeVerifierCiphertext: text("code_verifier_ciphertext").notNull(),
    codeVerifierIv: text("code_verifier_iv").notNull(),
    codeVerifierKeyVersion: text("code_verifier_key_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("slack_oauth_attempt_state_unique").on(table.stateHash),
    index("slack_oauth_attempt_owner_expiry_idx").on(
      table.workspaceId,
      table.userId,
      table.expiresAt,
    ),
  ],
);

export const slackConnection = pgTable(
  "slack_connection",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    teamId: text("team_id").notNull(),
    teamName: text("team_name").notNull(),
    botUserId: text("bot_user_id").notNull(),
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    accessTokenIv: text("access_token_iv").notNull(),
    accessTokenKeyVersion: text("access_token_key_version").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("connected"),
    lastErrorCode: text("last_error_code"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("slack_connection_owner_team_unique").on(
      table.workspaceId,
      table.ownerUserId,
      table.teamId,
    ),
    index("slack_connection_workspace_status_idx").on(table.workspaceId, table.status),
    check("slack_connection_status_check", sql`${table.status} in ('connected', 'revoked')`),
  ],
);
