import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { user } from "./authentication";
import { timestampColumns } from "./columns";

export const aiAgentProfile = pgTable(
  "ai_agent_profile",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    icon: jsonb("icon"),
    cover: text("cover"),
    iconPosition: text("icon_position").notNull().default("inline"),
    instructions: text("instructions").notNull().default(""),
    defaultModel: text("default_model").notNull().default("auto"),
    currentRevisionId: text("current_revision_id"),
    status: text("status").notNull().default("active"),
    executionDisabledReason: text("execution_disabled_reason"),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_agent_profile_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
    ),
    check(
      "ai_agent_profile_status_check",
      sql`${table.status} in ('active', 'archived')`,
    ),
    check(
      "ai_agent_profile_icon_position_check",
      sql`${table.iconPosition} in ('inline', 'top')`,
    ),
    check("ai_agent_profile_version_check", sql`${table.version} > 0`),
  ],
);

export const aiAgentRevision = pgTable(
  "ai_agent_revision",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => aiAgentProfile.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition").notNull(),
    compiledDefinition: jsonb("compiled_definition").notNull(),
    definitionHash: text("definition_hash").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceMessageId: text("source_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_agent_revision_profile_version_unique").on(
      table.profileId,
      table.version,
    ),
    index("ai_agent_revision_profile_created_idx").on(
      table.profileId,
      table.createdAt,
    ),
    check("ai_agent_revision_version_check", sql`${table.version} > 0`),
  ],
);

export const aiAgentConversation = pgTable(
  "ai_agent_conversation",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => aiAgentProfile.id, { onDelete: "cascade" }),
    nextMessageSequence: integer("next_message_sequence").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_agent_conversation_profile_unique").on(table.profileId),
    index("ai_agent_conversation_profile_activity_idx").on(
      table.profileId,
      table.lastActivityAt,
    ),
  ],
);

export const aiAgentConversationMessage = pgTable(
  "ai_agent_conversation_message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiAgentConversation.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    clientId: text("client_id"),
    role: text("role").notNull(),
    kind: text("kind").notNull().default("message"),
    parts: jsonb("parts").$type<unknown[]>().notNull().default([]),
    sequence: integer("sequence").notNull(),
    runId: text("run_id"),
    revisionId: text("revision_id").references(() => aiAgentRevision.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("completed"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_agent_conversation_message_sequence_unique").on(
      table.conversationId,
      table.sequence,
    ),
    uniqueIndex("ai_agent_conversation_message_client_unique")
      .on(table.conversationId, table.clientId)
      .where(sql`${table.clientId} is not null`),
    index("ai_agent_conversation_message_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check(
      "ai_agent_conversation_message_role_check",
      sql`${table.role} in ('user', 'assistant', 'system')`,
    ),
    check(
      "ai_agent_conversation_message_kind_check",
      sql`${table.kind} in ('message', 'revision', 'run', 'approval')`,
    ),
    check(
      "ai_agent_conversation_message_status_check",
      sql`${table.status} in ('pending', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);

export const aiAgentTrigger = pgTable(
  "ai_agent_trigger",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => aiAgentProfile.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => aiAgentRevision.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    config: jsonb("config").notNull().default({}),
    status: text("status").notNull().default("active"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    webhookSecretId: text("webhook_secret_id"),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_agent_trigger_due_idx").on(table.status, table.nextRunAt),
    index("ai_agent_trigger_profile_status_idx").on(
      table.profileId,
      table.status,
    ),
    check(
      "ai_agent_trigger_kind_check",
      sql`${table.kind} in ('manual', 'schedule', 'database', 'comment', 'mention', 'meeting', 'webhook', 'slack', 'connector')`,
    ),
    check(
      "ai_agent_trigger_status_check",
      sql`${table.status} in ('active', 'paused', 'degraded', 'disabled')`,
    ),
  ],
);

export const aiAgentRun = pgTable(
  "ai_agent_run",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => aiAgentProfile.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => aiAgentRevision.id, { onDelete: "restrict" }),
    triggerId: text("trigger_id").references(() => aiAgentTrigger.id, {
      onDelete: "set null",
    }),
    initiatedByUserId: text("initiated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    triggerKind: text("trigger_kind").notNull(),
    occurrenceKey: text("occurrence_key"),
    input: jsonb("input").notNull().default({}),
    permissionSnapshot: jsonb("permission_snapshot").notNull().default({}),
    output: jsonb("output"),
    outputSummary: text("output_summary"),
    status: text("status").notNull().default("queued"),
    availableAt: timestamp("available_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 80 }),
    errorSummary: text("error_summary"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    chainDepth: integer("chain_depth").notNull().default(0),
    originRunId: text("origin_run_id"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_agent_run_occurrence_unique")
      .on(table.profileId, table.occurrenceKey)
      .where(sql`${table.occurrenceKey} is not null`),
    index("ai_agent_run_claim_idx")
      .on(table.status, table.availableAt, table.leaseExpiresAt)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("ai_agent_run_profile_created_idx").on(
      table.profileId,
      table.createdAt,
    ),
    check(
      "ai_agent_run_status_check",
      sql`${table.status} in ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'skipped')`,
    ),
    check(
      "ai_agent_run_trigger_kind_check",
      sql`${table.triggerKind} in ('manual', 'schedule', 'database', 'comment', 'mention', 'meeting', 'webhook', 'slack', 'connector')`,
    ),
    check(
      "ai_agent_run_attempts_check",
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.chainDepth} between 0 and 8`,
    ),
  ],
);

export const aiAgentRunEvent = pgTable(
  "ai_agent_run_event",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => aiAgentRun.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    visibility: text("visibility").notNull().default("shared"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_agent_run_event_sequence_unique").on(
      table.runId,
      table.sequence,
    ),
    index("ai_agent_run_event_created_idx").on(table.runId, table.createdAt),
    check(
      "ai_agent_run_event_visibility_check",
      sql`${table.visibility} in ('shared', 'editor')`,
    ),
  ],
);

export const aiAgentEventReceipt = pgTable(
  "ai_agent_event_receipt",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => aiAgentProfile.id, { onDelete: "cascade" }),
    triggerId: text("trigger_id").references(() => aiAgentTrigger.id, {
      onDelete: "cascade",
    }),
    eventKey: text("event_key").notNull(),
    runId: text("run_id").references(() => aiAgentRun.id, {
      onDelete: "set null",
    }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_agent_event_receipt_profile_event_unique").on(
      table.profileId,
      table.eventKey,
    ),
    index("ai_agent_event_receipt_received_idx").on(
      table.workspaceId,
      table.receivedAt,
    ),
  ],
);

export const aiAgentProfileAccess = pgTable(
  "ai_agent_profile_access",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => aiAgentProfile.id, { onDelete: "cascade" }),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    role: text("role").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_agent_profile_access_unique").on(
      table.profileId,
      table.principalType,
      table.principalId,
    ),
    index("ai_agent_profile_access_principal_idx").on(
      table.principalType,
      table.principalId,
      table.profileId,
    ),
    check(
      "ai_agent_profile_access_principal_check",
      sql`${table.principalType} in ('user', 'team')`,
    ),
    check(
      "ai_agent_profile_access_role_check",
      sql`${table.role} in ('editor', 'user')`,
    ),
  ],
);
