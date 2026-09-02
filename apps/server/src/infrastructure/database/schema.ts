import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

function timestampColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  };
}

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

function softDeleteColumns() {
  return {
    deletedById: text("deleted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestampColumns(),
  };
}

export const pageSettings = pgTable("page_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  embeddedItemsOpenAs: text("embedded_items_open_as")
    .notNull()
    .default("sidepanel"),
  pageFullWidth: boolean("page_full_width").notNull().default(false),
  sidebarConfig: jsonb("sidebar_config").notNull().default({}),
  ...timestampColumns(),
}, (table) => [
  uniqueIndex("page_settings_user_id_unique").on(table.userId),
]);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeWorkspaceId: text("active_workspace_id"),
    activeTeamId: text("active_team_id"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const desktopAuthorizationCode = pgTable(
  "desktop_authorization_code",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    codeChallenge: text("code_challenge").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeWorkspaceId: text("active_workspace_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("desktop_authorization_code_user_id_idx").on(table.userId),
    index("desktop_authorization_code_expires_at_idx").on(table.expiresAt),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("account_user_provider_idx").on(table.userId, table.providerId),
  ],
);

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
    lastErrorCode: text("last_error_code"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("gmail_account_owner_subject_unique").on(
      table.userId,
      table.googleSubject,
    ),
    uniqueIndex("gmail_account_id_user_unique").on(table.id, table.userId),
    index("gmail_account_email_idx").on(table.email),
    index("gmail_account_watch_expiry_idx").on(
      table.status,
      table.watchExpiresAt,
    ),
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
    index("gmail_oauth_attempt_user_expiry_idx").on(
      table.userId,
      table.expiresAt,
    ),
    index("gmail_oauth_attempt_workspace_idx").on(
      table.workspaceId,
      table.expiresAt,
    ),
    check(
      "gmail_oauth_attempt_client_kind_check",
      sql`${table.clientKind} in ('web', 'desktop')`,
    ),
  ],
);

export const slackOauthAttempt = pgTable(
  "slack_oauth_attempt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
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
    index("slack_oauth_attempt_owner_expiry_idx").on(table.workspaceId, table.userId, table.expiresAt),
  ],
);

export const slackConnection = pgTable(
  "slack_connection",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
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
    uniqueIndex("slack_connection_owner_team_unique").on(table.workspaceId, table.ownerUserId, table.teamId),
    index("slack_connection_workspace_status_idx").on(table.workspaceId, table.status),
    check("slack_connection_status_check", sql`${table.status} in ('connected', 'revoked')`),
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

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("verification_identifier_idx").on(table.identifier),
  ],
);

export const apikey = pgTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").notNull().default("default"),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull(),
    referenceId: text("reference_id").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at"),
    enabled: boolean("enabled").notNull().default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").notNull().default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_config_id_idx").on(table.configId),
    index("apikey_key_idx").on(table.key),
    index("apikey_reference_id_idx").on(table.referenceId),
  ],
);

export const workspace = pgTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    guestInviteMode: text("guest_invite_mode").notNull().default("direct"),
    teamspaceCreationPolicy: text("teamspace_creation_policy")
      .notNull()
      .default("workspace_members"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "workspace_guest_invite_mode_check",
      sql`${table.guestInviteMode} in ('direct', 'request', 'owners_only')`,
    ),
    check(
      "workspace_teamspace_creation_policy_check",
      sql`${table.teamspaceCreationPolicy} in ('workspace_owners', 'workspace_members')`,
    ),
  ],
);

export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    registrationMode: text("registration_mode")
      .notNull()
      .default("invite-only"),
    pinnedWorkspaceId: text("pinned_workspace_id").references(
      () => workspace.id,
      { onDelete: "restrict" },
    ),
    bootstrapCompletedAt: timestamp("bootstrap_completed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "instance_settings_registration_mode_check",
      sql`${table.registrationMode} in ('invite-only', 'open')`,
    ),
  ],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_workspace_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    index("member_user_id_idx").on(table.userId),
    index("member_access_expires_at_idx").on(table.accessExpiresAt),
    check(
      "member_temporary_expiry_check",
      sql`(${table.role} = 'temporary' and ${table.accessExpiresAt} is not null) or (${table.role} <> 'temporary' and ${table.accessExpiresAt} is null)`,
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

export const mailDatabaseSyncRecord = pgTable(
  "mail_database_sync_record",
  {
    id: text("id").primaryKey(),
    bindingId: text("binding_id")
      .notNull()
      .references(() => gmailWorkspaceConnection.id, { onDelete: "cascade" }),
    viewId: text("view_id")
      .notNull()
      .references(() => mailView.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    destinationDataSourceId: text("destination_data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "restrict" }),
    databaseRowId: text("database_row_id").notNull(),
    pageId: text("page_id").notNull(),
    status: text("status").notNull().default("active"),
    lastSourceUpdatedAt: timestamp("last_source_updated_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_database_sync_record_view_thread_unique").on(table.viewId, table.gmailThreadId),
    index("mail_database_sync_record_binding_idx").on(table.bindingId, table.updatedAt),
    index("mail_database_sync_record_destination_idx").on(table.destinationDataSourceId, table.databaseRowId),
    check("mail_database_sync_record_status_check", sql`${table.status} in ('active', 'paused')`),
  ],
);

export const mailDatabaseSyncOutbox = pgTable(
  "mail_database_sync_outbox",
  {
    id: text("id").primaryKey(),
    bindingId: text("binding_id")
      .notNull()
      .references(() => gmailWorkspaceConnection.id, { onDelete: "cascade" }),
    viewId: text("view_id")
      .notNull()
      .references(() => mailView.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    workerId: text("worker_id"),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_database_sync_outbox_view_thread_unique").on(table.viewId, table.gmailThreadId),
    index("mail_database_sync_outbox_ready_idx").on(table.status, table.nextAttemptAt),
    index("mail_database_sync_outbox_binding_idx").on(table.bindingId, table.updatedAt),
    check("mail_database_sync_outbox_status_check", sql`${table.status} in ('pending', 'processing', 'retry', 'completed', 'paused')`),
  ],
);

export const mailIndexState = pgTable("mail_index_state", {
  gmailAccountId: text("gmail_account_id")
    .primaryKey()
    .references(() => gmailAccount.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  generation: integer("generation").notNull().default(0),
  indexedThreadCount: integer("indexed_thread_count").notNull().default(0),
  resultSizeEstimate: integer("result_size_estimate"),
  historyId: text("history_id"),
  historyStartId: text("history_start_id"),
  historyPageToken: text("history_page_token"),
  nextPageToken: text("next_page_token"),
  lastErrorCode: text("last_error_code"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  leaseToken: text("lease_token"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestampColumns(),
});

export const mailThreadIndex = pgTable(
  "mail_thread_index",
  {
    id: text("id").primaryKey(),
    gmailAccountId: text("gmail_account_id")
      .notNull()
      .references(() => gmailAccount.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    generation: integer("generation").notNull(),
    latestMessageId: text("latest_message_id").notNull(),
    messageIds: jsonb("message_ids").$type<string[]>().notNull().default([]),
    labelIds: jsonb("label_ids").$type<string[]>().notNull().default([]),
    fromAddresses: jsonb("from_addresses").notNull().default([]),
    toAddresses: jsonb("to_addresses").notNull().default([]),
    ccAddresses: jsonb("cc_addresses").notNull().default([]),
    bccAddresses: jsonb("bcc_addresses").notNull().default([]),
    domains: jsonb("domains").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull(),
    internalDate: bigint("internal_date", { mode: "number" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    messageCount: integer("message_count").notNull(),
    attachmentCount: integer("attachment_count").notNull(),
    hasCalendarEvent: boolean("has_calendar_event").notNull().default(false),
    unread: boolean("unread").notNull().default(false),
    starred: boolean("starred").notNull().default(false),
    important: boolean("important").notNull().default(false),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("mail_thread_index_account_thread_unique").on(
      table.gmailAccountId,
      table.gmailThreadId,
    ),
    index("mail_thread_index_account_date_idx").on(
      table.gmailAccountId,
      table.internalDate,
    ),
    index("mail_thread_index_account_unread_idx").on(
      table.gmailAccountId,
      table.unread,
    ),
    index("mail_thread_index_account_starred_idx").on(
      table.gmailAccountId,
      table.starred,
    ),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at"),
    membershipExpiresAt: timestamp("membership_expires_at", {
      withTimezone: true,
    }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    teamId: text("team_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("invitation_workspace_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("invitation_email_idx").on(table.email),
    index("invitation_membership_expires_at_idx").on(
      table.membershipExpiresAt,
    ),
    check(
      "invitation_temporary_expiry_check",
      sql`(${table.role} = 'temporary' and ${table.membershipExpiresAt} is not null) or (${table.role} <> 'temporary' and ${table.membershipExpiresAt} is null)`,
    ),
  ],
);

export const team = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("team_workspace_id_idx").on(table.organizationId)],
);

export const teamMember = pgTable(
  "teamMember",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("team_member_user_team_idx").on(table.userId, table.teamId),
    index("team_member_team_id_idx").on(table.teamId),
  ],
);

export const teamspace = pgTable(
  "teamspace",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: jsonb("icon"),
    accessMode: text("access_mode").notNull().default("closed"),
    memberAccessLevel: text("member_access_level").notNull().default("edit"),
    invitePolicy: text("invite_policy")
      .notNull()
      .default("owners_and_members"),
    sidebarEditPolicy: text("sidebar_edit_policy")
      .notNull()
      .default("owners_and_members"),
    isDefault: boolean("is_default").notNull().default(false),
    inviteLinkEnabled: boolean("invite_link_enabled").notNull().default(false),
    inviteLinkTokenHash: text("invite_link_token_hash"),
    guestsEnabled: boolean("guests_enabled").notNull().default(true),
    publicSharingEnabled: boolean("public_sharing_enabled")
      .notNull()
      .default(true),
    exportEnabled: boolean("export_enabled").notNull().default(true),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archivedById: text("archived_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("teamspace_workspace_archived_updated_idx").on(
      table.workspaceId,
      table.archivedAt,
      table.updatedAt,
    ),
    index("teamspace_workspace_default_idx").on(
      table.workspaceId,
      table.isDefault,
    ),
    uniqueIndex("teamspace_workspace_active_name_unique")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    uniqueIndex("teamspace_invite_link_token_hash_unique")
      .on(table.inviteLinkTokenHash)
      .where(sql`${table.inviteLinkTokenHash} is not null`),
    check(
      "teamspace_access_mode_check",
      sql`${table.accessMode} in ('open', 'closed', 'private')`,
    ),
    check(
      "teamspace_member_access_level_check",
      sql`${table.memberAccessLevel} in ('view', 'comment', 'edit', 'full')`,
    ),
    check(
      "teamspace_invite_policy_check",
      sql`${table.invitePolicy} in ('owners', 'owners_and_members')`,
    ),
    check(
      "teamspace_sidebar_edit_policy_check",
      sql`${table.sidebarEditPolicy} in ('owners', 'owners_and_members')`,
    ),
    check(
      "teamspace_invite_link_state_check",
      sql`not ${table.inviteLinkEnabled} or ${table.inviteLinkTokenHash} is not null`,
    ),
  ],
);

export const teamspacePrincipal = pgTable(
  "teamspace_principal",
  {
    id: text("id").primaryKey(),
    teamspaceId: text("teamspace_id")
      .notNull()
      .references(() => teamspace.id, { onDelete: "cascade" }),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    role: text("role").notNull().default("member"),
    membershipSource: text("membership_source").notNull().default("explicit"),
    accessLevelOverride: text("access_level_override"),
    addedById: text("added_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("teamspace_principal_unique").on(
      table.teamspaceId,
      table.principalType,
      table.principalId,
    ),
    index("teamspace_principal_lookup_idx").on(
      table.principalType,
      table.principalId,
    ),
    index("teamspace_principal_teamspace_role_idx").on(
      table.teamspaceId,
      table.role,
    ),
    check(
      "teamspace_principal_type_check",
      sql`${table.principalType} in ('user', 'team')`,
    ),
    check(
      "teamspace_principal_role_check",
      sql`${table.role} in ('owner', 'member')`,
    ),
    check(
      "teamspace_principal_membership_source_check",
      sql`${table.membershipSource} in ('creator', 'explicit', 'default', 'self_join', 'invite_link', 'group')`,
    ),
    check(
      "teamspace_principal_access_override_check",
      sql`${table.accessLevelOverride} is null or ${table.accessLevelOverride} in ('view', 'comment', 'edit', 'full')`,
    ),
  ],
);

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
    apiKey: text("api_key"),
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

export const page = pgTable(
  "page",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    teamspaceId: text("teamspace_id").references(() => teamspace.id, {
      onDelete: "restrict",
    }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull().default("pageblock"),
    name: text("name").notNull(),
    url: text("url").notNull().default("#"),
    content: jsonb("content"),
    hasContent: boolean("has_content").notNull().default(false),
    metadata: jsonb("metadata"),
    ...softDeleteColumns(),
  },
  (table) => [
    index("page_workspace_deleted_idx").on(
      table.workspaceId,
      table.deletedAt,
    ),
    index("page_workspace_teamspace_deleted_idx").on(
      table.workspaceId,
      table.teamspaceId,
      table.deletedAt,
    ),
    index("page_type_idx").on(table.type),
    index("page_deleted_at_idx").on(table.deletedAt),
  ],
);

export const pageLayout = pgTable(
  "page_layout",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    config: jsonb("config").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("page_layout_workspace_idx").on(table.workspaceId),
    uniqueIndex("page_layout_scope_unique").on(table.scopeType, table.scopeId),
  ],
);

export const pageCollaborationDocument = pgTable(
  "page_collaboration_document",
  {
    pageId: text("page_id")
      .primaryKey()
      .references(() => page.id, { onDelete: "cascade" }),
    state: bytea("state").notNull(),
    ...timestampColumns(),
  },
  (table) => [index("page_collaboration_document_updated_idx").on(table.updatedAt)],
);

export const meeting = pgTable(
  "meeting",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    notesPageId: text("notes_page_id").references(() => page.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default("Meeting"),
    status: text("status").notNull().default("idle"),
    language: text("language").notNull().default("en"),
    instructionsPreset: text("instructions_preset").notNull().default("auto"),
    customInstructions: text("custom_instructions"),
    consentMessage: text("consent_message")
      .notNull()
      .default("This meeting will be recorded and transcribed."),
    autoPlayConsent: boolean("auto_play_consent").notNull().default(false),
    archiveLocalAudio: boolean("archive_local_audio").notNull().default(false),
    calendarEventId: text("calendar_event_id"),
    calendarSnapshot: jsonb("calendar_snapshot"),
    transcriptRevision: integer("transcript_revision").notNull().default(0),
    summarySourceSegmentCount: integer("summary_source_segment_count")
      .notNull()
      .default(0),
    summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
    recorderId: text("recorder_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recorderLeaseId: text("recorder_lease_id"),
    recorderLeaseExpiresAt: timestamp("recorder_lease_expires_at", {
      withTimezone: true,
    }),
    recordingStartedAt: timestamp("recording_started_at", {
      withTimezone: true,
    }),
    recordingStoppedAt: timestamp("recording_stopped_at", {
      withTimezone: true,
    }),
    durationMs: integer("duration_ms").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("meeting_page_deleted_idx").on(table.pageId, table.deletedAt),
    uniqueIndex("meeting_notes_page_id_unique").on(table.notesPageId),
    index("meeting_workspace_status_idx").on(table.workspaceId, table.status),
    check(
      "meeting_status_check",
      sql`${table.status} in ('idle', 'recording', 'paused', 'processing', 'completed', 'failed')`,
    ),
    check(
      "meeting_duration_check",
      sql`${table.durationMs} >= 0 and ${table.durationMs} <= 10800000`,
    ),
  ],
);

export const meetingCollaborationDocument = pgTable(
  "meeting_collaboration_document",
  {
    meetingId: text("meeting_id")
      .primaryKey()
      .references(() => meeting.id, { onDelete: "cascade" }),
    state: bytea("state").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("meeting_collaboration_document_updated_idx").on(table.updatedAt),
  ],
);

export const meetingTranscriptSegment = pgTable(
  "meeting_transcript_segment",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    sequence: integer("sequence").notNull(),
    text: text("text").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    speaker: text("speaker"),
    providerItemId: text("provider_item_id"),
    source: text("source")
      .$type<"microphone" | "system">()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("meeting_transcript_revision_sequence_unique").on(
      table.meetingId,
      table.revision,
      table.sequence,
    ),
    uniqueIndex("meeting_transcript_provider_item_unique").on(
      table.meetingId,
      table.providerItemId,
    ),
    index("meeting_transcript_revision_idx").on(
      table.meetingId,
      table.revision,
    ),
    check(
      "meeting_transcript_offsets_check",
      sql`${table.startMs} >= 0 and ${table.endMs} >= ${table.startMs}`,
    ),
    check(
      "meeting_transcript_source_check",
      sql`${table.source} in ('microphone', 'system')`,
    ),
  ],
);

export const meetingConsentEvent = pgTable(
  "meeting_consent_event",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    mode: text("mode").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("meeting_consent_meeting_idx").on(table.meetingId)],
);

export const pageAccess = pgTable(
  "page_access",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    accessLevel: text("access_level").notNull().default("view"),
    ...timestampColumns(),
  },
  (table) => [
    index("page_access_target_idx").on(
      table.workspaceId,
      table.targetType,
      table.targetId,
    ),
    uniqueIndex("page_access_target_unique").on(
      table.pageId,
      table.targetType,
      table.targetId,
    ),
  ],
);

export const workspaceGuest = pgTable(
  "workspace_guest",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitedById: text("invited_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("workspace_guest_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_guest_user_idx").on(table.userId),
  ],
);

export const pageGuestInvitation = pgTable(
  "page_guest_invitation",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    accessLevel: text("access_level").notNull().default("view"),
    status: text("status").notNull().default("pending"),
    inviterId: text("inviter_id").references(() => user.id, {
      onDelete: "set null",
    }),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("page_guest_invitation_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("page_guest_invitation_page_status_idx").on(
      table.pageId,
      table.status,
    ),
    index("page_guest_invitation_email_idx").on(table.email),
    uniqueIndex("page_guest_invitation_pending_unique")
      .on(table.pageId, sql`lower(${table.email})`)
      .where(sql`${table.status} = 'pending'`),
    check(
      "page_guest_invitation_access_level_check",
      sql`${table.accessLevel} in ('view', 'comment', 'edit', 'full')`,
    ),
    check(
      "page_guest_invitation_status_check",
      sql`${table.status} in ('pending', 'accepted', 'cancelled', 'expired')`,
    ),
  ],
);

export const pageGuestRequest = pgTable(
  "page_guest_request",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    accessLevel: text("access_level").notNull().default("view"),
    status: text("status").notNull().default("pending"),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("page_guest_request_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("page_guest_request_page_status_idx").on(table.pageId, table.status),
    uniqueIndex("page_guest_request_pending_unique")
      .on(table.pageId, sql`lower(${table.email})`)
      .where(sql`${table.status} = 'pending'`),
    check(
      "page_guest_request_access_level_check",
      sql`${table.accessLevel} in ('view', 'comment', 'edit', 'full')`,
    ),
    check(
      "page_guest_request_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'cancelled')`,
    ),
  ],
);

export const imageAsset = pgTable(
  "image_asset",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    databaseId: text("database_id").references(() => database.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: text("checksum"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("image_asset_workspace_idx").on(table.workspaceId),
    index("image_asset_page_deleted_idx").on(table.pageId, table.deletedAt),
    uniqueIndex("image_asset_object_key_unique").on(table.objectKey),
  ],
);


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
    uniqueIndex("favorites_user_page_unique").on(
      table.userId,
      table.pageId,
    ),
    uniqueIndex("favorites_user_database_unique").on(
      table.userId,
      table.databaseId,
    ),
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
    index("item_visit_user_workspace_idx").on(
      table.userId,
      table.workspaceId,
    ),
    index("item_visit_item_idx").on(table.itemKind, table.itemId),
    uniqueIndex("item_visit_user_item_unique").on(
      table.userId,
      table.itemKind,
      table.itemId,
    ),
  ],
);

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
    index("page_property_workspace_deleted_idx").on(
      table.workspaceId,
      table.deletedAt,
    ),
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
    uniqueIndex("page_property_value_unique").on(
      table.pageId,
      table.propertyId,
    ),
  ],
);

export const database = pgTable(
  "database",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    teamspaceId: text("teamspace_id").references(() => teamspace.id, {
      onDelete: "restrict",
    }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    pageId: text("page_id")
      .references(() => page.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: jsonb("config"),
    version: integer("version").notNull().default(0),
    ...softDeleteColumns(),
  },
  (table) => [
    index("database_workspace_deleted_idx").on(
      table.workspaceId,
      table.deletedAt,
    ),
    index("database_workspace_teamspace_deleted_idx").on(
      table.workspaceId,
      table.teamspaceId,
      table.deletedAt,
    ),
    index("database_page_id_idx").on(table.pageId),
    index("database_deleted_at_idx").on(table.deletedAt),
  ],
);

export const dataSource = pgTable(
  "data_source",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    parentDatabaseId: text("parent_database_id")
      .notNull()
      .references(() => database.id, { onDelete: "restrict" }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    config: jsonb("config"),
    configVersion: integer("config_version").notNull().default(1),
    version: integer("version").notNull().default(0),
    ...softDeleteColumns(),
  },
  (table) => [
    index("data_source_workspace_deleted_idx").on(
      table.workspaceId,
      table.deletedAt,
    ),
    index("data_source_parent_database_idx").on(table.parentDatabaseId),
  ],
);

export const databaseDataSource = pgTable(
  "database_data_source",
  {
    databaseId: text("database_id")
      .notNull()
      .references(() => database.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    linkedById: text("linked_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("database_data_source_unique").on(
      table.databaseId,
      table.dataSourceId,
    ),
    index("database_data_source_position_idx").on(
      table.databaseId,
      table.position,
    ),
    index("database_data_source_source_idx").on(table.dataSourceId),
  ],
);

export const databaseRealtimeOutbox = pgTable(
  "database_realtime_outbox",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id")
      .notNull()
      .references(() => database.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    actorId: text("actor_id").notNull(),
    changed: text("changed").array().notNull(),
    delta: jsonb("delta").notNull().default({}),
    requiresRefetch: boolean("requires_refetch").notNull().default(false),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("database_realtime_outbox_ready_idx").on(
      table.nextAttemptAt,
      table.committedAt,
    ),
    uniqueIndex("database_realtime_outbox_database_version_unique").on(
      table.databaseId,
      table.version,
    ),
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
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("navigation_realtime_outbox_ready_idx").on(
      table.nextAttemptAt,
      table.committedAt,
    ),
    index("navigation_realtime_outbox_workspace_idx").on(
      table.workspaceId,
      table.committedAt,
    ),
  ],
);

export const databaseAccess = pgTable(
  "database_access",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    databaseId: text("database_id")
      .notNull()
      .references(() => database.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    accessLevel: text("access_level").notNull().default("view"),
    ...timestampColumns(),
  },
  (table) => [
    index("database_access_target_idx").on(
      table.workspaceId,
      table.targetType,
      table.targetId,
    ),
    uniqueIndex("database_access_target_unique").on(
      table.databaseId,
      table.targetType,
      table.targetId,
    ),
  ],
);

export const databaseProperty = pgTable(
  "database_property",
  {
    id: text("id").primaryKey(),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => pageProperty.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    width: integer("width"),
    visible: boolean("visible").notNull().default(true),
    ...timestampColumns(),
  },
  (table) => [
    index("database_property_position_idx").on(
      table.dataSourceId,
      table.position,
    ),
    uniqueIndex("database_property_database_property_unique").on(
      table.dataSourceId,
      table.propertyId,
    ),
  ],
);

export const databaseView = pgTable(
  "database_view",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id")
      .notNull()
      .references(() => database.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    config: jsonb("config"),
    position: integer("position").notNull().default(0),
    ...timestampColumns(),
  },
  (table) => [
    index("database_view_position_idx").on(table.databaseId, table.position),
    index("database_view_data_source_idx").on(table.dataSourceId),
    foreignKey({
      columns: [table.databaseId, table.dataSourceId],
      foreignColumns: [
        databaseDataSource.databaseId,
        databaseDataSource.dataSourceId,
      ],
      name: "database_view_database_data_source_fk",
    }).onDelete("cascade"),
  ],
);

export const databaseRow = pgTable(
  "database_row",
  {
    id: text("id").primaryKey(),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    parentRowId: text("parent_row_id"),
    position: integer("position").notNull().default(0),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    lastEditedById: text("last_edited_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...softDeleteColumns(),
  },
  (table) => [
    index("database_row_database_deleted_position_idx").on(
      table.dataSourceId,
      table.deletedAt,
      table.position,
    ),
    index("database_row_parent_idx").on(table.dataSourceId, table.parentRowId),
    index("database_row_position_idx").on(table.dataSourceId, table.position),
    index("database_row_page_id_idx").on(table.pageId),
    index("database_row_deleted_at_idx").on(table.deletedAt),
    uniqueIndex("database_row_database_page_unique").on(
      table.dataSourceId,
      table.pageId,
    ),
  ],
);

export const databaseAutomation = pgTable(
  "database_automation",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    currentRevisionId: text("current_revision_id").notNull(),
    createIdempotencyKey: text("create_idempotency_key").notNull(),
    duplicatedFromId: text("duplicated_from_id"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunStatus: text("last_run_status"),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    errorActionId: text("error_action_id"),
    erroredAt: timestamp("errored_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("database_automation_source_status_idx").on(
      table.dataSourceId,
      table.status,
      table.updatedAt,
    ),
    index("database_automation_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
    ),
    index("database_automation_schedule_due_idx").on(
      table.status,
      table.nextRunAt,
    ),
    uniqueIndex("database_automation_create_idempotency_unique").on(
      table.createdById,
      table.dataSourceId,
      table.createIdempotencyKey,
    ),
    check(
      "database_automation_status_check",
      sql`${table.status} in ('active', 'paused', 'error', 'deleted')`,
    ),
    check(
      "database_automation_error_state_check",
      sql`(${table.status} = 'error' and ${table.errorCode} is not null and ${table.erroredAt} is not null) or (${table.status} <> 'error' and ${table.errorCode} is null and ${table.errorSummary} is null and ${table.errorActionId} is null and ${table.erroredAt} is null)`,
    ),
  ],
);

export const databaseAutomationRevision = pgTable(
  "database_automation_revision",
  {
    id: text("id").primaryKey(),
    automationId: text("automation_id")
      .notNull()
      .references(() => databaseAutomation.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definitionVersion: integer("definition_version").notNull(),
    definition: jsonb("definition").notNull(),
    compiledDefinition: jsonb("compiled_definition").notNull(),
    definitionHash: text("definition_hash").notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("database_automation_revision_version_unique").on(
      table.automationId,
      table.version,
    ),
    index("database_automation_revision_created_idx").on(
      table.automationId,
      table.createdAt,
    ),
    check(
      "database_automation_revision_version_check",
      sql`${table.version} > 0 and ${table.definitionVersion} > 0`,
    ),
  ],
);

export const databaseAutomationDependency = pgTable(
  "database_automation_dependency",
  {
    automationId: text("automation_id")
      .notNull()
      .references(() => databaseAutomation.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => databaseAutomationRevision.id, { onDelete: "cascade" }),
    dependencyType: text("dependency_type").notNull(),
    dependencyId: text("dependency_id").notNull(),
    usage: text("usage").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("database_automation_dependency_unique").on(
      table.revisionId,
      table.dependencyType,
      table.dependencyId,
      table.usage,
    ),
    index("database_automation_dependency_lookup_idx").on(
      table.dependencyType,
      table.dependencyId,
    ),
    check(
      "database_automation_dependency_type_check",
      sql`${table.dependencyType} in ('data_source', 'database', 'view', 'property', 'option', 'user', 'group', 'gmail_connection', 'slack_connection', 'secret')`,
    ),
  ],
);

export const databaseAutomationEventWindow = pgTable(
  "database_automation_event_window",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "cascade" }),
    rowId: text("row_id").notNull(),
    pageId: text("page_id").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    lastFactAt: timestamp("last_fact_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("accumulating"),
    rowAdded: boolean("row_added").notNull().default(false),
    changedPropertyIds: text("changed_property_ids").array().notNull().default([]),
    beforeValues: jsonb("before_values").notNull().default({}),
    afterValues: jsonb("after_values").notNull().default({}),
    actorIds: text("actor_ids").array().notNull().default([]),
    triggerActorId: text("trigger_actor_id"),
    origins: text("origins").array().notNull().default([]),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    terminalReason: text("terminal_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("database_automation_event_window_due_idx").on(
      table.status,
      table.closesAt,
      table.nextAttemptAt,
    ),
    index("database_automation_event_window_source_row_idx").on(
      table.dataSourceId,
      table.rowId,
      table.status,
    ),
    uniqueIndex("database_automation_event_window_accumulating_unique")
      .on(table.dataSourceId, table.rowId)
      .where(sql`${table.status} = 'accumulating'`),
    check(
      "database_automation_event_window_status_check",
      sql`${table.status} in ('accumulating', 'ready', 'processing', 'completed', 'discarded')`,
    ),
  ],
);

export const databaseAutomationRun = pgTable(
  "database_automation_run",
  {
    id: text("id").primaryKey(),
    automationId: text("automation_id")
      .notNull()
      .references(() => databaseAutomation.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => databaseAutomationRevision.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSource.id, { onDelete: "cascade" }),
    eventWindowId: text("event_window_id").references(
      () => databaseAutomationEventWindow.id,
      { onDelete: "set null" },
    ),
    triggerRowId: text("trigger_row_id"),
    triggerPageId: text("trigger_page_id"),
    triggerActorId: text("trigger_actor_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    occurrenceKey: text("occurrence_key"),
    triggerTime: timestamp("trigger_time", { withTimezone: true }).notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull().default({}),
    definitionHash: text("definition_hash").notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    skipReason: text("skip_reason"),
    summary: jsonb("summary"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("database_automation_run_event_unique").on(
      table.eventWindowId,
      table.automationId,
    ),
    uniqueIndex("database_automation_run_occurrence_unique").on(
      table.automationId,
      table.occurrenceKey,
    ),
    index("database_automation_run_claim_idx").on(
      table.status,
      table.leaseExpiresAt,
      table.createdAt,
    ),
    index("database_automation_run_history_idx").on(
      table.automationId,
      table.createdAt,
    ),
    check(
      "database_automation_run_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled')`,
    ),
  ],
);

export const databaseAutomationStepRun = pgTable(
  "database_automation_step_run",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => databaseAutomationRun.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    actionIndex: integer("action_index").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    inputSummary: jsonb("input_summary"),
    outputSummary: jsonb("output_summary"),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("database_automation_step_run_action_unique").on(
      table.runId,
      table.actionId,
    ),
    index("database_automation_step_run_status_idx").on(
      table.runId,
      table.status,
      table.actionIndex,
    ),
    check(
      "database_automation_step_run_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'skipped')`,
    ),
  ],
);

export const databaseAutomationDelivery = pgTable(
  "database_automation_delivery",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => databaseAutomationRun.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    destinationHash: text("destination_hash").notNull(),
    kind: text("kind").notNull(),
    deliveryId: text("delivery_id").notNull().unique(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    providerReference: text("provider_reference"),
    responseStatus: integer("response_status"),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("database_automation_delivery_destination_unique").on(
      table.runId,
      table.actionId,
      table.destinationHash,
    ),
    index("database_automation_delivery_ready_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    check(
      "database_automation_delivery_kind_check",
      sql`${table.kind} in ('notification', 'gmail', 'webhook', 'slack')`,
    ),
    check(
      "database_automation_delivery_status_check",
      sql`${table.status} in ('pending', 'sending', 'retrying', 'succeeded', 'failed')`,
    ),
  ],
);

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
    index("in_product_notification_inbox_idx").on(
      table.workspaceId,
      table.userId,
      table.createdAt,
    ),
    index("in_product_notification_unread_idx").on(
      table.workspaceId,
      table.userId,
      table.readAt,
    ),
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
    check(
      "in_product_notification_outbox_status_check",
      sql`${table.status} in ('pending', 'published')`,
    ),
  ],
);

export const automationSecret = pgTable(
  "automation_secret",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    purpose: text("purpose").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    keyVersion: text("key_version").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("automation_secret_workspace_owner_idx").on(
      table.workspaceId,
      table.ownerUserId,
      table.createdAt,
    ),
  ],
);

export const pageItemPlacement = pgTable(
  "page_item_placement",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    parentKind: text("parent_kind").notNull(),
    parentId: text("parent_id").notNull(),
    itemKind: text("item_kind").notNull(),
    itemId: text("item_id").notNull(),
    placementKind: text("placement_kind").notNull(),
    sourceRowId: text("source_row_id").references(() => databaseRow.id, {
      onDelete: "cascade",
    }),
    position: integer("position").notNull().default(0),
    ...timestampColumns(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("page_item_placement_parent_idx").on(
      table.workspaceId,
      table.parentKind,
      table.parentId,
      table.deletedAt,
    ),
    index("page_item_placement_item_idx").on(
      table.workspaceId,
      table.itemKind,
      table.itemId,
      table.deletedAt,
    ),
    uniqueIndex("page_item_placement_active_unique").on(
      table.workspaceId,
      table.parentKind,
      table.parentId,
      table.itemKind,
      table.itemId,
      table.placementKind,
      table.sourceRowId,
      table.deletedAt,
    ),
  ],
);

export const aiChatThread = pgTable(
  "ai_chat_thread",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    nextMessageSequence: integer("next_message_sequence").notNull().default(0),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestampColumns(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_chat_thread_workspace_user_activity_idx").on(
      table.workspaceId,
      table.userId,
      table.deletedAt,
      table.lastActivityAt,
    ),
    index("ai_chat_thread_workspace_user_archived_activity_idx").on(
      table.workspaceId,
      table.userId,
      table.archivedAt,
      table.deletedAt,
      table.lastActivityAt,
    ),
  ],
);

export const aiChatMessage = pgTable(
  "ai_chat_message",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id"),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull().default([]),
    sequence: integer("sequence").notNull().default(0),
    status: text("status").notNull().default("completed"),
    turnId: text("turn_id"),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_chat_message_thread_created_idx").on(table.threadId, table.createdAt),
    uniqueIndex("ai_chat_message_thread_client_unique").on(
      table.threadId,
      table.clientId,
    ),
    uniqueIndex("ai_chat_message_thread_sequence_unique").on(
      table.threadId,
      table.sequence,
    ),
    check(
      "ai_chat_message_status_check",
      sql`${table.status} in ('completed', 'failed', 'cancelled')`,
    ),
  ],
);

export const aiChatThreadSummary = pgTable(
  "ai_chat_thread_summary",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    coveredThroughSequence: integer("covered_through_sequence").notNull(),
    summary: text("summary").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_chat_thread_summary_thread_unique").on(table.threadId),
  ],
);

export const aiAgentUserPreference = pgTable(
  "ai_agent_user_preference",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    instructions: text("instructions").notNull().default(""),
    responseStyle: text("response_style").notNull().default("concise"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_agent_user_preference_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    check(
      "ai_agent_user_preference_response_style_check",
      sql`${table.responseStyle} in ('concise', 'balanced', 'detailed')`,
    ),
  ],
);

export const aiChatFeedback = pgTable(
  "ai_chat_feedback",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => aiChatMessage.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    reason: text("reason"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_chat_feedback_user_message_unique").on(
      table.userId,
      table.messageId,
    ),
    index("ai_chat_feedback_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    check("ai_chat_feedback_rating_check", sql`${table.rating} in (-1, 1)`),
  ],
);

export const aiAgentTurn = pgTable(
  "ai_agent_turn",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    clientTurnId: text("client_turn_id"),
    userMessageId: text("user_message_id").references(() => aiChatMessage.id, {
      onDelete: "set null",
    }),
    requestedModel: text("requested_model").notNull(),
    status: text("status").notNull().default("running"),
    inputMessageCount: integer("input_message_count").notNull().default(0),
    inputCharacterCount: integer("input_character_count").notNull().default(0),
    attachmentCount: integer("attachment_count").notNull().default(0),
    stepCount: integer("step_count").notNull().default(0),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_agent_turn_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("ai_agent_turn_user_created_idx").on(
      table.workspaceId,
      table.userId,
      table.createdAt,
    ),
    index("ai_agent_turn_running_idx").on(
      table.workspaceId,
      table.status,
      table.startedAt,
    ),
    uniqueIndex("ai_agent_turn_thread_client_unique").on(
      table.threadId,
      table.clientTurnId,
    ),
    check(
      "ai_agent_turn_status_check",
      sql`${table.status} in ('running', 'succeeded', 'failed', 'cancelled', 'rejected')`,
    ),
    check(
      "ai_agent_turn_counts_check",
      sql`${table.inputMessageCount} >= 0 and ${table.inputCharacterCount} >= 0 and ${table.attachmentCount} >= 0 and ${table.stepCount} >= 0 and ${table.toolCallCount} >= 0`,
    ),
  ],
);

export const aiAgentToolExecution = pgTable(
  "ai_agent_tool_execution",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id")
      .notNull()
      .references(() => aiAgentTurn.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    effect: text("effect").notNull(),
    stepNumber: integer("step_number"),
    status: text("status").notNull().default("running"),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_agent_tool_execution_turn_call_unique").on(
      table.turnId,
      table.toolCallId,
    ),
    index("ai_agent_tool_execution_turn_created_idx").on(
      table.turnId,
      table.createdAt,
    ),
    check(
      "ai_agent_tool_execution_effect_check",
      sql`${table.effect} in ('read', 'write', 'analysis', 'artifact')`,
    ),
    check(
      "ai_agent_tool_execution_status_check",
      sql`${table.status} in ('running', 'succeeded', 'failed', 'cancelled')`,
    ),
  ],
);

export const aiAgentActionReceipt = pgTable(
  "ai_agent_action_receipt",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull().default("running"),
    result: jsonb("result"),
    error: text("error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_agent_action_receipt_thread_tool_call_unique").on(
      table.threadId,
      table.toolCallId,
    ),
    index("ai_agent_action_receipt_workspace_user_created_idx").on(
      table.workspaceId,
      table.userId,
      table.createdAt,
    ),
  ],
);

export const aiAgentPendingAction = pgTable(
  "ai_agent_pending_action",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    toolVersion: integer("tool_version").notNull(),
    toolInput: jsonb("tool_input").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull().default("pending"),
    result: jsonb("result"),
    error: text("error"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_agent_pending_action_owner_status_idx").on(
      table.workspaceId,
      table.userId,
      table.threadId,
      table.status,
    ),
    index("ai_agent_pending_action_expiry_idx").on(table.status, table.expiresAt),
    uniqueIndex("ai_agent_pending_action_thread_call_unique").on(
      table.threadId,
      table.toolCallId,
    ),
    check(
      "ai_agent_pending_action_status_check",
      sql`${table.status} in ('pending', 'executing', 'succeeded', 'failed', 'rejected', 'expired')`,
    ),
  ],
);

export const searchDocument = pgTable(
  "search_document",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourcePageId: text("source_page_id"),
    title: text("title").notNull(),
    path: text("path").notNull(),
    emoji: text("emoji"),
    contentText: text("content_text").notNull().default(""),
    searchVector: tsvector("search_vector").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("search_document_source_unique").on(
      table.workspaceId,
      table.sourceType,
      table.sourceId,
    ),
    index("search_document_workspace_type_updated_idx").on(
      table.workspaceId,
      table.sourceType,
      table.sourceUpdatedAt,
    ),
  ],
);

export const searchChunk = pgTable(
  "search_chunk",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => searchDocument.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    searchVector: tsvector("search_vector").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("search_chunk_document_index_unique").on(
      table.documentId,
      table.chunkIndex,
    ),
    index("search_chunk_workspace_document_idx").on(
      table.workspaceId,
      table.documentId,
    ),
  ],
);

export const aiJob = pgTable(
  "ai_job",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").notNull().default("queued"),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    error: text("error"),
    progress: integer("progress").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    leasedAt: timestamp("leased_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    workerId: text("worker_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_job_dedupe_unique").on(
      table.workspaceId,
      table.type,
      table.dedupeKey,
    ),
    index("ai_job_claim_idx").on(table.status, table.availableAt, table.leaseExpiresAt),
    index("ai_job_owner_created_idx").on(table.workspaceId, table.userId, table.createdAt),
    check(
      "ai_job_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check("ai_job_progress_check", sql`${table.progress} between 0 and 100`),
  ],
);

export const aiChatUpload = pgTable(
  "ai_chat_upload",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: text("checksum"),
    status: text("status").notNull().default("pending"),
    extractedText: text("extracted_text"),
    extraction: jsonb("extraction"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_chat_upload_object_key_unique").on(table.objectKey),
    index("ai_chat_upload_owner_thread_idx").on(
      table.workspaceId,
      table.userId,
      table.threadId,
      table.createdAt,
    ),
    index("ai_chat_upload_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export const aiChatArtifact = pgTable(
  "ai_chat_artifact",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: text("checksum").notNull(),
    status: text("status").notNull().default("ready"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_chat_artifact_object_key_unique").on(table.objectKey),
    index("ai_chat_artifact_owner_thread_idx").on(
      table.workspaceId,
      table.userId,
      table.threadId,
      table.createdAt,
    ),
    index("ai_chat_artifact_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export const rateLimit = pgTable("rateLimit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});
