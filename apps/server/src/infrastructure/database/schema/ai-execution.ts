import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { user } from "./authentication";
import { aiChatThread, aiChatMessage } from "./ai-conversations";
import { aiAgentProfile, aiAgentRun } from "./ai-agents";
import { timestampColumns } from "./columns";
import { aiMcpConnection } from "./ai-mcp";

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
    agentProfileId: text("agent_profile_id").references(() => aiAgentProfile.id, {
      onDelete: "set null",
    }),
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
    index("ai_agent_turn_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("ai_agent_turn_user_created_idx").on(table.workspaceId, table.userId, table.createdAt),
    index("ai_agent_turn_running_idx").on(table.workspaceId, table.status, table.startedAt),
    uniqueIndex("ai_agent_turn_thread_client_unique").on(table.threadId, table.clientTurnId),
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
    turnId: text("turn_id").references(() => aiAgentTurn.id, {
      onDelete: "cascade",
    }),
    agentRunId: text("agent_run_id").references(() => aiAgentRun.id, {
      onDelete: "cascade",
    }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    effect: text("effect").notNull(),
    connectionId: text("connection_id").references(() => aiMcpConnection.id, {
      onDelete: "set null",
    }),
    externalToolName: text("external_tool_name"),
    actualEffect: text("actual_effect"),
    schemaHash: text("schema_hash"),
    approvalActorUserId: text("approval_actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    outcomeUnknown: boolean("outcome_unknown").notNull().default(false),
    stepNumber: integer("step_number"),
    status: text("status").notNull().default("running"),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_agent_tool_execution_turn_call_unique")
      .on(table.turnId, table.toolCallId)
      .where(sql`${table.turnId} is not null`),
    uniqueIndex("ai_agent_tool_execution_run_call_unique")
      .on(table.agentRunId, table.toolCallId)
      .where(sql`${table.agentRunId} is not null`),
    index("ai_agent_tool_execution_turn_created_idx").on(table.turnId, table.createdAt),
    index("ai_agent_tool_execution_run_created_idx").on(table.agentRunId, table.createdAt),
    check(
      "ai_agent_tool_execution_context_check",
      sql`(${table.turnId} is not null)::int + (${table.agentRunId} is not null)::int = 1`,
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
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => aiChatThread.id, {
      onDelete: "cascade",
    }),
    agentRunId: text("agent_run_id").references(() => aiAgentRun.id, {
      onDelete: "cascade",
    }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    toolVersion: integer("tool_version").notNull(),
    toolInput: jsonb("tool_input").notNull(),
    agentProfileId: text("agent_profile_id").references(() => aiAgentProfile.id, {
      onDelete: "cascade",
    }),
    mcpScopeType: text("mcp_scope_type"),
    mcpScopeUserId: text("mcp_scope_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    connectionId: text("connection_id").references(() => aiMcpConnection.id, {
      onDelete: "cascade",
    }),
    externalToolName: text("external_tool_name"),
    toolSchemaHash: text("tool_schema_hash"),
    encryptedToolInput: text("encrypted_tool_input"),
    encryptedToolInputIv: text("encrypted_tool_input_iv"),
    encryptedToolInputAuthTag: text("encrypted_tool_input_auth_tag"),
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
    uniqueIndex("ai_agent_pending_action_thread_call_unique")
      .on(table.threadId, table.toolCallId)
      .where(sql`${table.threadId} is not null`),
    uniqueIndex("ai_agent_pending_action_run_call_unique")
      .on(table.agentRunId, table.toolCallId)
      .where(sql`${table.agentRunId} is not null`),
    check(
      "ai_agent_pending_action_context_check",
      sql`(${table.threadId} is not null)::int + (${table.agentRunId} is not null)::int = 1`,
    ),
    check(
      "ai_agent_pending_action_status_check",
      sql`${table.status} in ('pending', 'executing', 'succeeded', 'failed', 'rejected', 'expired')`,
    ),
    check(
      "ai_agent_pending_action_mcp_scope_check",
      sql`${table.connectionId} is null or (${table.mcpScopeType} = 'agent' and ${table.agentProfileId} is not null and ${table.mcpScopeUserId} is null) or (${table.mcpScopeType} = 'personal' and ${table.agentProfileId} is null and ${table.mcpScopeUserId} is not null)`,
    ),
  ],
);
