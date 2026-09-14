import { boolean, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { workspace, teamspace } from "./workspaces";
import { user } from "./authentication";
import { page } from "./pages";
import { softDeleteColumns } from "./soft-delete-columns";
import { timestampColumns } from "./columns";
import { pageProperty } from "./page-properties";

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

export const databaseMutationEvent = pgTable(
  "database_mutation_event",
  {
    id: text("id").primaryKey(),
    commandId: text("command_id").notNull(),
    databaseId: text("database_id")
      .notNull()
      .references(() => database.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id").references(() => dataSource.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id").notNull(),
    protocolVersion: integer("protocol_version").notNull().default(2),
    version: integer("version").notNull(),
    areas: text("areas").array().notNull(),
    changes: jsonb("changes").notNull().default({}),
    requiresReset: boolean("requires_reset").notNull().default(false),
    committedAt: timestamp("committed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("database_mutation_event_database_version_unique").on(
      table.databaseId,
      table.version,
    ),
    index("database_mutation_event_database_committed_idx").on(
      table.databaseId,
      table.committedAt,
    ),
    index("database_mutation_event_command_idx").on(table.commandId),
    index("database_mutation_event_retention_idx").on(table.committedAt),
  ],
);

export const databaseCommandReceipt = pgTable(
  "database_command_receipt",
  {
    commandId: text("command_id").primaryKey(),
    databaseId: text("database_id")
      .notNull()
      .references(() => database.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id").references(() => dataSource.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id").notNull(),
    requestHash: text("request_hash").notNull(),
    eventId: text("event_id")
      .notNull()
      .references(() => databaseMutationEvent.id, { onDelete: "cascade" }),
    acknowledgement: jsonb("acknowledgement").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("database_command_receipt_database_created_idx").on(
      table.databaseId,
      table.createdAt,
    ),
    index("database_command_receipt_retention_idx").on(table.expiresAt),
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
    orderKey: numeric("order_key", { precision: 30, scale: 10 }),
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
