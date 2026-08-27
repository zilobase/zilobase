import { sql } from "drizzle-orm";
import {
  boolean,
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
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThread.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull().default([]),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_chat_message_thread_created_idx").on(table.threadId, table.createdAt),
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
