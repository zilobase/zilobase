import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspaces";
import { timestampColumns } from "./columns";
import { user } from "./authentication";
import { aiAgentProfile } from "./ai-agents";

export const aiWorkspaceMcpPolicy = pgTable(
  "ai_workspace_mcp_policy",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspace.id, { onDelete: "cascade" }),
    customServersEnabled: boolean("custom_servers_enabled").notNull().default(false),
    installationPolicy: text("installation_policy").notNull().default("approved_and_catalog"),
    externalWritesEnabled: boolean("external_writes_enabled").notNull().default(false),
    ...timestampColumns(),
  },
  (table) => [
    check(
      "ai_workspace_mcp_installation_policy_check",
      sql`${table.installationPolicy} in ('approved_and_catalog', 'approved_only')`,
    ),
  ],
);

export const aiMcpApprovedServer = pgTable(
  "ai_mcp_approved_server",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    endpointUrl: text("endpoint_url").notNull(),
    label: text("label").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_mcp_approved_server_workspace_url_unique").on(
      table.workspaceId,
      table.endpointUrl,
    ),
  ],
);

export const aiMcpConnection = pgTable(
  "ai_mcp_connection",
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
    catalogId: text("catalog_id"),
    approvedServerId: text("approved_server_id").references(() => aiMcpApprovedServer.id, {
      onDelete: "restrict",
    }),
    endpointUrl: text("endpoint_url").notNull(),
    serverLabel: text("server_label").notNull(),
    authMethod: text("auth_method").notNull(),
    authenticatedByUserId: text("authenticated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("connecting"),
    alwaysAllowEnabled: boolean("always_allow_enabled").notNull().default(false),
    lastDiscoveredAt: timestamp("last_discovered_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 80 }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_mcp_connection_profile_endpoint_unique")
      .on(table.agentProfileId, table.endpointUrl)
      .where(sql`${table.scopeType} = 'agent'`),
    uniqueIndex("ai_mcp_connection_personal_endpoint_unique")
      .on(table.workspaceId, table.scopeUserId, table.endpointUrl)
      .where(sql`${table.scopeType} = 'personal'`),
    index("ai_mcp_connection_profile_state_idx").on(table.agentProfileId, table.state),
    check("ai_mcp_connection_auth_method_check", sql`${table.authMethod} in ('oauth', 'headers')`),
    check(
      "ai_mcp_connection_state_check",
      sql`${table.state} in ('connecting', 'connected', 'degraded', 'reconnect_required', 'disabled')`,
    ),
    check(
      "ai_mcp_connection_scope_check",
      sql`(${table.scopeType} = 'agent' and ${table.agentProfileId} is not null and ${table.scopeUserId} is null) or (${table.scopeType} = 'personal' and ${table.agentProfileId} is null and ${table.scopeUserId} is not null and ${table.authenticatedByUserId} = ${table.scopeUserId})`,
    ),
  ],
);

export const aiMcpCredential = pgTable("ai_mcp_credential", {
  connectionId: text("connection_id")
    .primaryKey()
    .references(() => aiMcpConnection.id, { onDelete: "cascade" }),
  keyVersion: text("key_version").notNull(),
  secretPurpose: text("secret_purpose").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestampColumns(),
});

export const aiMcpOauthAttempt = pgTable(
  "ai_mcp_oauth_attempt",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => aiMcpConnection.id, { onDelete: "cascade" }),
    stateHash: text("state_hash").notNull().unique(),
    keyVersion: text("key_version").notNull(),
    codeVerifierCiphertext: text("code_verifier_ciphertext").notNull(),
    codeVerifierIv: text("code_verifier_iv").notNull(),
    codeVerifierAuthTag: text("code_verifier_auth_tag").notNull(),
    issuer: text("issuer"),
    redirectUri: text("redirect_uri").notNull(),
    returnTo: text("return_to"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ai_mcp_oauth_attempt_expiry_idx").on(table.expiresAt, table.consumedAt)],
);

export const aiMcpClientRegistration = pgTable(
  "ai_mcp_client_registration",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => aiMcpConnection.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    keyVersion: text("key_version"),
    clientSecretCiphertext: text("client_secret_ciphertext"),
    clientSecretIv: text("client_secret_iv"),
    clientSecretAuthTag: text("client_secret_auth_tag"),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_mcp_client_registration_connection_issuer_unique").on(
      table.connectionId,
      table.issuer,
    ),
  ],
);

export const aiMcpToolSnapshot = pgTable(
  "ai_mcp_tool_snapshot",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => aiMcpConnection.id, { onDelete: "cascade" }),
    externalName: text("external_name").notNull(),
    description: text("description").notNull().default(""),
    inputSchema: jsonb("input_schema").notNull(),
    annotations: jsonb("annotations").notNull().default({}),
    schemaHash: text("schema_hash").notNull(),
    classification: text("classification").notNull().default("unknown"),
    executionMode: text("execution_mode").notNull().default("always_ask"),
    enabled: boolean("enabled").notNull().default(false),
    available: boolean("available").notNull().default(true),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ai_mcp_tool_snapshot_connection_name_unique").on(
      table.connectionId,
      table.externalName,
    ),
    index("ai_mcp_tool_snapshot_enabled_idx").on(
      table.connectionId,
      table.enabled,
      table.available,
    ),
    check(
      "ai_mcp_tool_snapshot_classification_check",
      sql`${table.classification} in ('read', 'write', 'unknown')`,
    ),
    check(
      "ai_mcp_tool_snapshot_execution_mode_check",
      sql`${table.executionMode} in ('automatic', 'always_ask')`,
    ),
  ],
);

export const aiMcpActivity = pgTable(
  "ai_mcp_activity",
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
    connectionId: text("connection_id").references(() => aiMcpConnection.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    outcome: text("outcome").notNull(),
    providerLabel: text("provider_label"),
    toolName: text("tool_name"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ai_mcp_activity_profile_created_idx").on(table.agentProfileId, table.createdAt),
    index("ai_mcp_activity_personal_created_idx").on(
      table.workspaceId,
      table.scopeUserId,
      table.createdAt,
    ),
    check(
      "ai_mcp_activity_scope_check",
      sql`(${table.scopeType} = 'agent' and ${table.agentProfileId} is not null and ${table.scopeUserId} is null) or (${table.scopeType} = 'personal' and ${table.agentProfileId} is null and ${table.scopeUserId} is not null)`,
    ),
  ],
);
