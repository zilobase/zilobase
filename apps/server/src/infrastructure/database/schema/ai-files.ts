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
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { aiAgentProfile, aiAgentRun } from "./ai-agents";
import { user } from "./authentication";
import { aiMcpConnection } from "./ai-mcp";
import { aiChatThread } from "./ai-conversations";
import { aiAgentToolExecution } from "./ai-execution";
import { timestampColumns } from "./columns";
import { aiJob } from "./background";

export const aiMcpDataset = pgTable(
  "ai_mcp_dataset",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull().default("agent"),
    agentProfileId: text("agent_profile_id").references(() => aiAgentProfile.id, {
      onDelete: "cascade",
    }),
    scopeUserId: text("scope_user_id").references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => aiMcpConnection.id, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => aiChatThread.id, {
      onDelete: "cascade",
    }),
    agentRunId: text("agent_run_id").references(() => aiAgentRun.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    toolExecutionId: text("tool_execution_id").references(() => aiAgentToolExecution.id, {
      onDelete: "set null",
    }),
    externalToolName: text("external_tool_name").notNull(),
    schema: jsonb("schema").notNull(),
    sample: jsonb("sample").notNull().default([]),
    rowCount: integer("row_count").notNull().default(0),
    byteSize: integer("byte_size").notNull().default(0),
    truncated: boolean("truncated").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_mcp_dataset_owner_expiry_idx").on(
      table.workspaceId,
      table.userId,
      table.threadId,
      table.expiresAt,
    ),
    check(
      "ai_mcp_dataset_limits_check",
      sql`${table.rowCount} between 0 and 10000 and ${table.byteSize} between 0 and 26214400`,
    ),
    check(
      "ai_mcp_dataset_scope_check",
      sql`(${table.scopeType} = 'agent' and ${table.agentProfileId} is not null and ${table.scopeUserId} is null) or (${table.scopeType} = 'personal' and ${table.agentProfileId} is null and ${table.scopeUserId} is not null)`,
    ),
    check(
      "ai_mcp_dataset_context_check",
      sql`(${table.threadId} is not null)::int + (${table.agentRunId} is not null)::int = 1`,
    ),
  ],
);

export const aiMcpDatasetChunk = pgTable(
  "ai_mcp_dataset_chunk",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => aiMcpDataset.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    rows: jsonb("rows").notNull(),
    rowCount: integer("row_count").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ai_mcp_dataset_chunk_dataset_index_unique").on(table.datasetId, table.chunkIndex),
  ],
);

export const aiMcpMaterialization = pgTable(
  "ai_mcp_materialization",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull().default("agent"),
    agentProfileId: text("agent_profile_id").references(() => aiAgentProfile.id, {
      onDelete: "cascade",
    }),
    scopeUserId: text("scope_user_id").references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => aiChatThread.id, {
      onDelete: "cascade",
    }),
    agentRunId: text("agent_run_id").references(() => aiAgentRun.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    aiJobId: text("ai_job_id").references(() => aiJob.id, {
      onDelete: "set null",
    }),
    databaseId: text("database_id"),
    dataSourceId: text("data_source_id"),
    name: text("name").notNull(),
    mapping: jsonb("mapping").notNull(),
    status: text("status").notNull().default("queued"),
    completedRows: integer("completed_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    errorCode: varchar("error_code", { length: 80 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    index("ai_mcp_materialization_job_idx").on(table.aiJobId),
    check(
      "ai_mcp_materialization_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'partial', 'failed')`,
    ),
    check(
      "ai_mcp_materialization_scope_check",
      sql`(${table.scopeType} = 'agent' and ${table.agentProfileId} is not null and ${table.scopeUserId} is null) or (${table.scopeType} = 'personal' and ${table.agentProfileId} is null and ${table.scopeUserId} is not null)`,
    ),
    check(
      "ai_mcp_materialization_context_check",
      sql`(${table.threadId} is not null)::int + (${table.agentRunId} is not null)::int = 1`,
    ),
  ],
);

export const aiMcpMaterializationReservation = pgTable(
  "ai_mcp_materialization_reservation",
  {
    id: text("id").primaryKey(),
    materializationId: text("materialization_id")
      .notNull()
      .references(() => aiMcpMaterialization.id, { onDelete: "cascade" }),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => aiMcpDataset.id, { onDelete: "cascade" }),
    sourceRowIndex: integer("source_row_index").notNull(),
    rowId: text("row_id").notNull(),
    pageId: text("page_id").notNull(),
    status: text("status").notNull().default("reserved"),
    errorCode: varchar("error_code", { length: 80 }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_mcp_materialization_source_row_unique").on(
      table.materializationId,
      table.datasetId,
      table.sourceRowIndex,
    ),
    uniqueIndex("ai_mcp_materialization_row_id_unique").on(table.rowId),
    uniqueIndex("ai_mcp_materialization_page_id_unique").on(table.pageId),
    index("ai_mcp_materialization_reservation_status_idx").on(
      table.materializationId,
      table.status,
      table.sourceRowIndex,
    ),
    check(
      "ai_mcp_materialization_reservation_status_check",
      sql`${table.status} in ('reserved', 'inserted', 'failed')`,
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
