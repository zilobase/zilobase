import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./authentication";
import { timestampColumns } from "./columns";
import { workspace, member } from "./workspaces";

export const gmailAccount = pgTable(
  "gmail_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    googleSubject: text("google_subject").notNull(),
    email: text("email").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
    refreshTokenIv: text("refresh_token_iv").notNull(),
    refreshTokenKeyVersion: text("refresh_token_key_version").notNull(),
    status: text("status").notNull().default("connected"),
    notificationHistoryId: text("notification_history_id"),
    mailboxRevision: integer("mailbox_revision").notNull().default(0),
    watchExpiresAt: timestamp("watch_expires_at", { withTimezone: true }),
    lastWatchAt: timestamp("last_watch_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 80 }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("gmail_account_owner_subject_unique").on(table.userId, table.googleSubject),
    uniqueIndex("gmail_account_id_user_unique").on(table.id, table.userId),
    index("gmail_account_email_idx").on(table.email),
    index("gmail_account_watch_expiry_idx").on(table.status, table.watchExpiresAt),
    check(
      "gmail_account_status_check",
      sql`${table.status} in ('connected', 'reconnect_required')`,
    ),
  ],
);

export const gmailOauthAttempt = pgTable(
  "gmail_oauth_attempt",
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
    clientKind: text("client_kind").notNull(),
    returnPath: text("return_path").notNull().default("/mail"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("gmail_oauth_attempt_state_unique").on(table.stateHash),
    index("gmail_oauth_attempt_user_expiry_idx").on(table.userId, table.expiresAt),
    index("gmail_oauth_attempt_workspace_idx").on(table.workspaceId, table.expiresAt),
    check("gmail_oauth_attempt_client_kind_check", sql`${table.clientKind} in ('web', 'desktop')`),
  ],
);

export const gmailSendOperation = pgTable(
  "gmail_send_operation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => gmailAccount.id, { onDelete: "cascade" }),
    rfcMessageId: text("rfc_message_id").notNull(),
    compositionHash: text("composition_hash"),
    draftId: text("draft_id"),
    status: text("status").notNull().default("pending"),
    gmailMessageId: text("gmail_message_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("gmail_send_operation_connection_idx").on(table.connectionId),
    index("gmail_send_operation_expiry_idx").on(table.expiresAt),
    check(
      "gmail_send_operation_status_check",
      sql`${table.status} in ('pending', 'ambiguous', 'sent', 'failed')`,
    ),
  ],
);

export const gmailWorkspaceConnection = pgTable(
  "gmail_workspace_connection",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    gmailAccountId: text("gmail_account_id").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("gmail_workspace_connection_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("gmail_workspace_connection_account_idx").on(table.gmailAccountId),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [member.organizationId, member.userId],
      name: "gmail_workspace_connection_member_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.gmailAccountId, table.userId],
      foreignColumns: [gmailAccount.id, gmailAccount.userId],
      name: "gmail_workspace_connection_account_owner_fk",
    }).onDelete("cascade"),
  ],
);
