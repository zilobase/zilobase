import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
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

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pageSettings = pgTable("page_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  embeddedItemsOpenAs: text("embedded_items_open_as")
    .notNull()
    .default("sidepanel"),
  pageFullWidth: boolean("page_full_width").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
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

// Enterprise SSO (Better Auth `sso` plugin). EE-owned; the table exists only in
// enterprise/cloud builds. Field keys match Better Auth's ssoProvider model.
export const ssoProvider = pgTable(
  "sso_provider",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    oidcConfig: text("oidc_config"),
    samlConfig: text("saml_config"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull().unique(),
    organizationId: text("organization_id"),
    domain: text("domain").notNull(),
  },
  (table) => [index("sso_provider_domain_idx").on(table.domain)],
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

export const workspace = pgTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("member_workspace_user_idx").on(
      table.organizationId,
      table.userId,
    ),
    index("member_user_id_idx").on(table.userId),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("workspace_ai_provider_config_provider_idx").on(
      table.workspaceId,
      table.providerId,
    ),
    index("workspace_ai_provider_config_workspace_idx").on(table.workspaceId),
  ],
);

export const page = pgTable(
  "page",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull().default("pageblock"),
    name: text("name").notNull(),
    url: text("url").notNull().default("#"),
    content: jsonb("content"),
    metadata: jsonb("metadata"),
    deletedById: text("deleted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("page_workspace_id_idx").on(table.workspaceId),
    index("page_workspace_deleted_idx").on(
      table.workspaceId,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("page_collaboration_document_updated_idx").on(table.updatedAt)],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("page_access_workspace_id_idx").on(table.workspaceId),
    index("page_access_page_id_idx").on(table.pageId),
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
    index("image_asset_page_idx").on(table.pageId),
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
    index("favorites_user_id_idx").on(table.userId),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("item_visit_user_id_idx").on(table.userId),
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
    deletedById: text("deleted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("page_property_workspace_id_idx").on(table.workspaceId),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("page_property_value_page_id_idx").on(table.pageId),
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
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    pageId: text("page_id")
      .references(() => page.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: jsonb("config"),
    version: integer("version").notNull().default(0),
    deletedById: text("deleted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("database_workspace_id_idx").on(table.workspaceId),
    index("database_workspace_deleted_idx").on(
      table.workspaceId,
      table.deletedAt,
    ),
    index("database_page_id_idx").on(table.pageId),
    index("database_deleted_at_idx").on(table.deletedAt),
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
    index("database_realtime_outbox_database_id_idx").on(table.databaseId),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("database_access_workspace_id_idx").on(table.workspaceId),
    index("database_access_database_id_idx").on(table.databaseId),
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
    databaseId: text("database_id")
      .notNull()
      .references(() => database.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => pageProperty.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    width: integer("width"),
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("database_property_database_id_idx").on(table.databaseId),
    index("database_property_position_idx").on(
      table.databaseId,
      table.position,
    ),
    uniqueIndex("database_property_database_property_unique").on(
      table.databaseId,
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
    type: text("type").notNull(),
    name: text("name").notNull(),
    config: jsonb("config"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("database_view_database_id_idx").on(table.databaseId),
    index("database_view_position_idx").on(table.databaseId, table.position),
  ],
);

export const databaseRow = pgTable(
  "database_row",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id")
      .notNull()
      .references(() => database.id, { onDelete: "cascade" }),
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
    deletedById: text("deleted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("database_row_database_id_idx").on(table.databaseId),
    index("database_row_database_deleted_position_idx").on(
      table.databaseId,
      table.deletedAt,
      table.position,
    ),
    index("database_row_parent_idx").on(table.databaseId, table.parentRowId),
    index("database_row_position_idx").on(table.databaseId, table.position),
    index("database_row_page_id_idx").on(table.pageId),
    index("database_row_deleted_at_idx").on(table.deletedAt),
    uniqueIndex("database_row_database_page_unique").on(
      table.databaseId,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("page_item_placement_workspace_idx").on(table.workspaceId),
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
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_chat_message_thread_created_idx").on(table.threadId, table.createdAt),
  ],
);

export const rateLimit = pgTable("rateLimit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});
