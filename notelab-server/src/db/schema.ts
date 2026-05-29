import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workspaceSettings = pgTable("workspace_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  workspaceFullWidth: boolean("workspace_full_width").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex("workspace_settings_user_id_unique").on(table.userId),
]);

export const session = pgTable("session", {
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
  activeOrganizationId: text("active_organization_id"),
  activeTeamId: text("active_team_id"),
});

export const account = pgTable("account", {
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
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at"),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  teamId: text("team_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const team = pgTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const teamMember = pgTable("teamMember", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => team.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationIntegration = pgTable(
  "organization_integration",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    connectedById: text("connected_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    integrationKey: text("integration_key").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    displayName: text("display_name"),
    status: text("status").notNull().default("connected"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenType: text("token_type"),
    scopes: text("scopes"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("organization_integration_account_idx").on(
      table.organizationId,
      table.integrationKey,
      table.providerAccountId,
    ),
    index("organization_integration_org_idx").on(table.organizationId),
    index("organization_integration_key_idx").on(
      table.organizationId,
      table.integrationKey,
    ),
    index("organization_integration_status_idx").on(table.status),
  ],
);

export const organizationAiProviderConfig = pgTable(
  "organization_ai_provider_config",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    uniqueIndex("organization_ai_provider_config_provider_idx").on(
      table.organizationId,
      table.providerId,
    ),
    index("organization_ai_provider_config_org_idx").on(table.organizationId),
  ],
);

export const workspace = pgTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    index("workspace_organization_id_idx").on(table.organizationId),
    index("workspace_type_idx").on(table.type),
    index("workspace_deleted_at_idx").on(table.deletedAt),
  ],
);

export const workspaceAccess = pgTable(
  "workspace_access",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
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
    index("workspace_access_organization_id_idx").on(table.organizationId),
    index("workspace_access_workspace_id_idx").on(table.workspaceId),
    index("workspace_access_target_idx").on(
      table.organizationId,
      table.targetType,
      table.targetId,
    ),
    uniqueIndex("workspace_access_target_unique").on(
      table.workspaceId,
      table.targetType,
      table.targetId,
    ),
  ],
);

export const favorite = pgTable(
  "favorites",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspace.id, {
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
    index("favorites_workspace_id_idx").on(table.workspaceId),
    index("favorites_database_id_idx").on(table.databaseId),
    uniqueIndex("favorites_user_workspace_unique").on(
      table.userId,
      table.workspaceId,
    ),
    uniqueIndex("favorites_user_database_unique").on(
      table.userId,
      table.databaseId,
    ),
  ],
);

export const workspaceProperty = pgTable(
  "workspace_property",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    index("workspace_property_organization_id_idx").on(table.organizationId),
    index("workspace_property_deleted_at_idx").on(table.deletedAt),
  ],
);

export const workspacePropertyValue = pgTable(
  "workspace_property_value",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => workspaceProperty.id, { onDelete: "cascade" }),
    value: jsonb("value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workspace_property_value_workspace_id_idx").on(table.workspaceId),
    index("workspace_property_value_property_id_idx").on(table.propertyId),
    uniqueIndex("workspace_property_value_unique").on(
      table.workspaceId,
      table.propertyId,
    ),
  ],
);

export const database = pgTable(
  "database",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
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
    index("database_organization_id_idx").on(table.organizationId),
    index("database_page_id_idx").on(table.pageId),
    index("database_deleted_at_idx").on(table.deletedAt),
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
      .references(() => workspaceProperty.id, { onDelete: "cascade" }),
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
      .references(() => workspace.id, { onDelete: "cascade" }),
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

export const rateLimit = pgTable("rateLimit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});
