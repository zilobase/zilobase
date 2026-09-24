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
import { dataSource } from "./databases";
import { user } from "./authentication";
import { timestampColumns } from "./columns";

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
    index("database_automation_schedule_due_idx").on(table.status, table.nextRunAt),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("database_automation_revision_version_unique").on(
      table.automationId,
      table.version,
    ),
    index("database_automation_revision_created_idx").on(table.automationId, table.createdAt),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("database_automation_dependency_unique").on(
      table.revisionId,
      table.dependencyType,
      table.dependencyId,
      table.usage,
    ),
    index("database_automation_dependency_lookup_idx").on(table.dependencyType, table.dependencyId),
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
    index("database_automation_event_window_active_due_idx")
      .on(table.closesAt, table.nextAttemptAt, table.leaseExpiresAt)
      .where(sql`${table.status} in ('accumulating', 'ready', 'processing')`),
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
    eventWindowId: text("event_window_id").references(() => databaseAutomationEventWindow.id, {
      onDelete: "set null",
    }),
    triggerRowId: text("trigger_row_id"),
    triggerPageId: text("trigger_page_id"),
    triggerActorId: text("trigger_actor_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    occurrenceKey: text("occurrence_key"),
    triggerTime: timestamp("trigger_time", { withTimezone: true }).notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull().default({}),
    definitionHash: text("definition_hash").notNull(),
    status: text("status").notNull().default("queued"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
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
    uniqueIndex("database_automation_run_event_unique").on(table.eventWindowId, table.automationId),
    uniqueIndex("database_automation_run_occurrence_unique").on(
      table.automationId,
      table.occurrenceKey,
    ),
    index("database_automation_run_claim_idx")
      .on(table.status, table.availableAt, table.leaseExpiresAt, table.workspaceId, table.createdAt)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("database_automation_run_history_idx").on(table.automationId, table.createdAt),
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
    uniqueIndex("database_automation_step_run_action_unique").on(table.runId, table.actionId),
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
    index("database_automation_delivery_ready_idx").on(table.status, table.nextAttemptAt),
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
