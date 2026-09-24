import type {
  McpActivityEntry,
  McpConnectionSummary,
  McpToolPolicy,
} from "@zilobase/features/ai-chat/mcp-contract";
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "../../../../infrastructure/database";
import {
  aiMcpActivity,
  aiMcpApprovedServer,
  aiMcpConnection,
  aiMcpCredential,
  aiMcpToolSnapshot,
  aiWorkspaceMcpPolicy,
} from "../../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../../shared/config/config";
import { AgentProfileError } from "../../agents/agent-profile-service";
import { getMcpCatalogEntry } from "./catalog";
import { MCP_LIMITS, isMcpCustomServersEnabled } from "./config";
import { encryptMcpSecret } from "./credential-crypto";
import { discoverConnectionTools } from "../transport/mcp-client";
import {
  getMcpCredentialScopeId,
  getMcpScopeColumns,
  getMcpScopeFromConnection,
  getMcpScopeRef,
  requireMcpScopeAccess,
  type McpScope,
} from "../mcp-scope";
import {
  McpEgressError,
  normalizeMcpEndpoint,
  validateMcpCustomHeaderName,
} from "../transport/secure-egress";

import { McpServiceError } from "../transport/mcp-errors";

export async function getWorkspaceMcpPolicy(workspaceId: string) {
  const [policy] = await db
    .select()
    .from(aiWorkspaceMcpPolicy)
    .where(eq(aiWorkspaceMcpPolicy.workspaceId, workspaceId))
    .limit(1);
  return (
    policy ?? {
      customServersEnabled: false,
      externalWritesEnabled: false,
      installationPolicy: "approved_and_catalog" as const,
      workspaceId,
    }
  );
}

export async function updateWorkspaceMcpPolicy(input: {
  customServersEnabled: boolean;
  externalWritesEnabled: boolean;
  installationPolicy: "approved_and_catalog" | "approved_only";
  workspaceId: string;
}) {
  const now = new Date();
  const [policy] = await db
    .insert(aiWorkspaceMcpPolicy)
    .values({
      ...input,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        customServersEnabled: input.customServersEnabled,
        externalWritesEnabled: input.externalWritesEnabled,
        installationPolicy: input.installationPolicy,
        updatedAt: now,
      },
      target: aiWorkspaceMcpPolicy.workspaceId,
    })
    .returning();
  return policy;
}

export async function listApprovedMcpServers(workspaceId: string) {
  return db
    .select()
    .from(aiMcpApprovedServer)
    .where(eq(aiMcpApprovedServer.workspaceId, workspaceId))
    .orderBy(aiMcpApprovedServer.label);
}

export async function addApprovedMcpServer(input: {
  endpointUrl: string;
  label: string;
  userId: string;
  workspaceId: string;
}) {
  const endpointUrl = normalizeMcpEndpoint(input.endpointUrl);
  const now = new Date();
  const [server] = await db
    .insert(aiMcpApprovedServer)
    .values({
      createdAt: now,
      createdByUserId: input.userId,
      endpointUrl,
      id: crypto.randomUUID(),
      label: input.label,
      updatedAt: now,
      workspaceId: input.workspaceId,
    })
    .returning();
  return server;
}

export async function removeApprovedMcpServer(input: { serverId: string; workspaceId: string }) {
  const removed = await db
    .delete(aiMcpApprovedServer)
    .where(
      and(
        eq(aiMcpApprovedServer.id, input.serverId),
        eq(aiMcpApprovedServer.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: aiMcpApprovedServer.id });
  return removed.length > 0;
}

export async function createMcpConnection(input: {
  scope: McpScope;
  approvedServerId?: string;
  authMethod: "oauth" | "headers";
  catalogId?: string;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
}) {
  await requireMcpScopeAccess({
    minimum: "editor",
    scope: input.scope,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const [connectionCount] = await db
    .select({ value: count() })
    .from(aiMcpConnection)
    .where(
      and(
        scopeConnectionCondition(input.scope),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
      ),
    );
  if (Number(connectionCount?.value ?? 0) >= MCP_LIMITS.maxConnectionsPerAgent) {
    throw new McpServiceError(
      "mcp_connection_limit",
      "This Ask AI context can have at most 10 connections.",
      409,
    );
  }
  const policy = await getWorkspaceMcpPolicy(input.workspaceId);
  let endpointUrl: string;
  let serverLabel: string;
  let catalogId: string | null = null;
  let approvedServerId: string | null = null;
  if (input.catalogId) {
    const catalog = getMcpCatalogEntry(input.catalogId);
    if (!catalog || !catalog.available) {
      throw new McpServiceError(
        "mcp_catalog_unavailable",
        catalog?.availabilityReason ?? "Catalog server is unavailable.",
        409,
      );
    }
    if (policy.installationPolicy === "approved_only") {
      throw new McpServiceError(
        "mcp_catalog_not_approved",
        "Workspace policy only permits explicitly approved servers.",
        403,
      );
    }
    if (!catalog.authMethods.includes(input.authMethod)) {
      throw new McpServiceError(
        "mcp_auth_unsupported",
        "This authentication method is not supported.",
      );
    }
    endpointUrl = normalizeMcpEndpoint(catalog.endpoint);
    serverLabel = catalog.label;
    catalogId = catalog.id;
  } else if (input.approvedServerId) {
    if (!isMcpCustomServersEnabled(input.env) || !policy.customServersEnabled) {
      throw new McpServiceError(
        "mcp_custom_servers_disabled",
        "Custom MCP servers are disabled.",
        403,
      );
    }
    const [server] = await db
      .select()
      .from(aiMcpApprovedServer)
      .where(
        and(
          eq(aiMcpApprovedServer.id, input.approvedServerId),
          eq(aiMcpApprovedServer.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!server)
      throw new McpServiceError("mcp_server_not_approved", "Approved server not found.", 404);
    endpointUrl = normalizeMcpEndpoint(server.endpointUrl);
    serverLabel = server.label;
    approvedServerId = server.id;
  } else {
    throw new McpServiceError("mcp_server_required", "Choose a catalog or approved custom server.");
  }
  const now = new Date();
  const [connection] = await db
    .insert(aiMcpConnection)
    .values({
      ...getMcpScopeColumns(input.scope),
      approvedServerId,
      authenticatedByUserId: input.userId,
      authMethod: input.authMethod,
      catalogId,
      createdAt: now,
      endpointUrl,
      id: crypto.randomUUID(),
      serverLabel,
      state: "connecting",
      updatedAt: now,
      workspaceId: input.workspaceId,
    })
    .returning();
  if (!connection)
    throw new McpServiceError("mcp_connection_create_failed", "Could not create connection.", 409);
  await recordMcpActivity({
    actorUserId: input.userId,
    scope: input.scope,
    connectionId: connection.id,
    eventType: "connection_created",
    outcome: "succeeded",
    providerLabel: serverLabel,
    workspaceId: input.workspaceId,
  });
  return serializeConnection(connection);
}

export async function submitMcpHeaders(input: {
  scope: McpScope;
  connectionId: string;
  env: RuntimeEnv;
  headers: Array<{ name: string; value: string }>;
  userId: string;
  workspaceId: string;
}) {
  const connection = await requireOwnedConnection(input);
  if (connection.authMethod !== "headers") {
    throw new McpServiceError(
      "mcp_auth_method_mismatch",
      "Connection does not use header authentication.",
      409,
    );
  }
  if (input.headers.length === 0 || input.headers.length > MCP_LIMITS.maxHeaders) {
    throw new McpServiceError("mcp_header_limit", "Provide between one and five headers.");
  }
  const seen = new Set<string>();
  const headers = input.headers.map((header) => {
    const name = validateMcpCustomHeaderName(header.name);
    if (seen.has(name))
      throw new McpServiceError("mcp_header_duplicate", "Header names must be unique.");
    seen.add(name);
    if (!header.value || header.value.length > 8_192) {
      throw new McpServiceError("mcp_header_value_invalid", "Header value is empty or too large.");
    }
    return { name, value: header.value };
  });
  const secret = await encryptMcpSecret(input.env, JSON.stringify({ kind: "headers", headers }), {
    authenticatedByUserId: input.userId,
    connectionId: connection.id,
    profileId: getMcpCredentialScopeId(connection),
    purpose: "connection_auth",
    workspaceId: connection.workspaceId,
  });
  const now = new Date();
  await db
    .insert(aiMcpCredential)
    .values({
      ...secret,
      connectionId: connection.id,
      createdAt: now,
      secretPurpose: "connection_auth",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: { ...secret, secretPurpose: "connection_auth", updatedAt: now },
      target: aiMcpCredential.connectionId,
    });
  let discoveredTools = 0;
  try {
    discoveredTools = await discoverConnectionTools({
      connectionId: connection.id,
      env: input.env,
    });
  } catch {
    // Discovery records a degraded/reconnect state without disclosing provider details.
  }
  await recordMcpActivity({
    actorUserId: input.userId,
    scope: input.scope,
    connectionId: connection.id,
    eventType: "connection_authenticated",
    metadata: { discoveredTools },
    outcome: discoveredTools > 0 ? "succeeded" : "degraded",
    providerLabel: connection.serverLabel,
    workspaceId: input.workspaceId,
  });
  return getMcpConnection(input);
}

export async function listMcpConnections(input: {
  scope: McpScope;
  userId: string;
  workspaceId: string;
}) {
  await requireMcpScopeAccess({ ...input, minimum: "user" });
  const connections = await db
    .select()
    .from(aiMcpConnection)
    .where(
      and(
        eq(aiMcpConnection.workspaceId, input.workspaceId),
        scopeConnectionCondition(input.scope),
      ),
    )
    .orderBy(aiMcpConnection.serverLabel);
  const membershipByAuthenticator = new Map<string, boolean>();
  for (const connection of connections) {
    if (!membershipByAuthenticator.has(connection.authenticatedByUserId)) {
      const { getMembership } = await import("../../../access");
      membershipByAuthenticator.set(
        connection.authenticatedByUserId,
        Boolean(await getMembership(input.workspaceId, connection.authenticatedByUserId)),
      );
    }
    if (
      !membershipByAuthenticator.get(connection.authenticatedByUserId) &&
      connection.state !== "disabled" &&
      connection.state !== "reconnect_required"
    ) {
      connection.state = "reconnect_required";
      connection.lastErrorCode = "authenticator_inactive";
      await db
        .update(aiMcpConnection)
        .set({
          lastErrorCode: connection.lastErrorCode,
          state: connection.state,
          updatedAt: new Date(),
        })
        .where(eq(aiMcpConnection.id, connection.id));
    }
  }
  return Promise.all(
    connections.map(async (connection) => ({
      ...serializeConnection(connection),
      tools: await listConnectionTools(connection.id),
    })),
  );
}

export async function getMcpConnection(input: {
  scope: McpScope;
  connectionId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireMcpScopeAccess({ ...input, minimum: "user" });
  const [connection] = await db
    .select()
    .from(aiMcpConnection)
    .where(
      and(
        eq(aiMcpConnection.id, input.connectionId),
        scopeConnectionCondition(input.scope),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!connection)
    throw new McpServiceError("mcp_connection_not_found", "Connection not found.", 404);
  return { ...serializeConnection(connection), tools: await listConnectionTools(connection.id) };
}

export async function refreshMcpConnection(input: {
  scope: McpScope;
  connectionId: string;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
}) {
  await requireOwnedConnection(input);
  const discoveredTools = await discoverConnectionTools({
    connectionId: input.connectionId,
    env: input.env,
  });
  return { connection: await getMcpConnection(input), discoveredTools };
}

export async function updateMcpToolPolicies(input: {
  scope: McpScope;
  connectionId: string;
  policies: Array<{
    classification: "read" | "write" | "unknown";
    enabled: boolean;
    executionMode: "automatic" | "always_ask";
    toolId: string;
  }>;
  userId: string;
  workspaceId: string;
}) {
  const connection = await requireOwnedConnection(input);
  const ids = input.policies.map((policy) => policy.toolId);
  const current =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(aiMcpToolSnapshot)
          .where(
            and(
              eq(aiMcpToolSnapshot.connectionId, connection.id),
              inArray(aiMcpToolSnapshot.id, ids),
            ),
          );
  if (current.length !== new Set(ids).size) {
    throw new McpServiceError("mcp_tool_not_found", "One or more tools are unavailable.", 404);
  }
  const enabling = input.policies.filter((policy) => policy.enabled).length;
  const [currentlyEnabled] = await db
    .select({ value: count() })
    .from(aiMcpToolSnapshot)
    .innerJoin(aiMcpConnection, eq(aiMcpConnection.id, aiMcpToolSnapshot.connectionId))
    .where(
      and(
        scopeConnectionCondition(input.scope),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
        eq(aiMcpToolSnapshot.enabled, true),
      ),
    );
  const selectedCurrentlyEnabled = current.filter((tool) => tool.enabled).length;
  if (
    Number(currentlyEnabled?.value ?? 0) - selectedCurrentlyEnabled + enabling >
    MCP_LIMITS.maxEnabledToolsPerAgent
  ) {
    throw new McpServiceError(
      "mcp_enabled_tool_limit",
      "This Ask AI context can enable at most 100 connector tools.",
      409,
    );
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const policy of input.policies) {
      await tx
        .update(aiMcpToolSnapshot)
        .set({
          classification: policy.classification,
          enabled: policy.enabled,
          executionMode: policy.executionMode,
          updatedAt: now,
        })
        .where(
          and(
            eq(aiMcpToolSnapshot.id, policy.toolId),
            eq(aiMcpToolSnapshot.connectionId, connection.id),
          ),
        );
    }
    await tx
      .delete(aiMcpToolSnapshot)
      .where(
        and(
          eq(aiMcpToolSnapshot.connectionId, connection.id),
          eq(aiMcpToolSnapshot.available, false),
        ),
      );
  });
  return getMcpConnection(input);
}

export async function setMcpAlwaysAllow(input: {
  scope: McpScope;
  confirmed: boolean;
  connectionId: string;
  enabled: boolean;
  userId: string;
  workspaceId: string;
}) {
  const connection = await requireOwnedConnection(input);
  if (input.enabled && !input.confirmed) {
    throw new McpServiceError(
      "mcp_confirmation_required",
      "Explicit confirmation is required.",
      409,
    );
  }
  await db
    .update(aiMcpConnection)
    .set({
      alwaysAllowEnabled: input.enabled,
      updatedAt: new Date(),
    })
    .where(eq(aiMcpConnection.id, connection.id));
  return getMcpConnection(input);
}

export async function disconnectMcpConnection(input: {
  scope: McpScope;
  connectionId: string;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
}) {
  await requireMcpScopeAccess({ ...input, minimum: "editor" });
  const [connection] = await db
    .select()
    .from(aiMcpConnection)
    .where(
      and(
        eq(aiMcpConnection.id, input.connectionId),
        scopeConnectionCondition(input.scope),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!connection) return false;
  if (connection.authMethod === "oauth") {
    try {
      const { revokeStoredMcpOAuthCredential } = await import("./oauth-credentials");
      await revokeStoredMcpOAuthCredential({ connection, env: input.env });
    } catch {
      // Revocation is best-effort. Local deletion below remains authoritative.
    }
  }
  await recordMcpActivity({
    actorUserId: input.userId,
    scope: input.scope,
    connectionId: connection.id,
    eventType: "connection_disconnected",
    outcome: "succeeded",
    providerLabel: connection.serverLabel,
    workspaceId: input.workspaceId,
  });
  await db.delete(aiMcpConnection).where(eq(aiMcpConnection.id, connection.id));
  return true;
}

export async function listMcpActivity(input: {
  scope: McpScope;
  userId: string;
  workspaceId: string;
}) {
  await requireMcpScopeAccess({
    ...input,
    minimum: input.scope.type === "agent" ? "editor" : "user",
  });
  const rows = await db
    .select()
    .from(aiMcpActivity)
    .where(
      and(scopeActivityCondition(input.scope), eq(aiMcpActivity.workspaceId, input.workspaceId)),
    )
    .orderBy(desc(aiMcpActivity.createdAt))
    .limit(200);
  return rows.map((row): McpActivityEntry => ({
    actorUserId: row.actorUserId,
    connectionId: row.connectionId,
    createdAt: row.createdAt.toISOString(),
    eventType: row.eventType,
    id: row.id,
    metadata: sanitizeActivityMetadata(row.metadata),
    outcome: row.outcome,
    providerLabel: row.providerLabel,
    toolName: row.toolName,
  }));
}

export async function recordMcpActivity(input: {
  actorUserId?: string | null;
  scope: McpScope;
  connectionId?: string | null;
  eventType: string;
  metadata?: Record<string, string | number | boolean | null>;
  outcome: string;
  providerLabel?: string | null;
  toolName?: string | null;
  workspaceId: string;
}) {
  await db.insert(aiMcpActivity).values({
    actorUserId: input.actorUserId ?? null,
    ...getMcpScopeColumns(input.scope),
    connectionId: input.connectionId ?? null,
    createdAt: new Date(),
    eventType: input.eventType.slice(0, 120),
    id: crypto.randomUUID(),
    metadata: sanitizeActivityMetadata(input.metadata),
    outcome: input.outcome.slice(0, 80),
    providerLabel: input.providerLabel?.slice(0, 160) ?? null,
    toolName: input.toolName?.slice(0, 160) ?? null,
    workspaceId: input.workspaceId,
  });
}

async function requireOwnedConnection(input: {
  scope: McpScope;
  connectionId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireMcpScopeAccess({ ...input, minimum: "editor" });
  const [connection] = await db
    .select()
    .from(aiMcpConnection)
    .where(
      and(
        eq(aiMcpConnection.id, input.connectionId),
        scopeConnectionCondition(input.scope),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!connection)
    throw new McpServiceError("mcp_connection_not_found", "Connection not found.", 404);
  if (connection.authenticatedByUserId !== input.userId) {
    throw new McpServiceError(
      "mcp_authenticator_required",
      "Only the member who authenticated this connection can change credentials or tool policy.",
      403,
    );
  }
  return connection;
}

async function listConnectionTools(connectionId: string): Promise<McpToolPolicy[]> {
  const tools = await db
    .select()
    .from(aiMcpToolSnapshot)
    .where(eq(aiMcpToolSnapshot.connectionId, connectionId))
    .orderBy(aiMcpToolSnapshot.externalName);
  return tools.map((tool) => ({
    available: tool.available,
    classification: tool.classification as McpToolPolicy["classification"],
    description: tool.description,
    enabled: tool.enabled,
    executionMode: tool.executionMode as McpToolPolicy["executionMode"],
    externalName: tool.externalName,
    id: tool.id,
    schemaHash: tool.schemaHash,
  }));
}

function serializeConnection(
  connection: typeof aiMcpConnection.$inferSelect,
): McpConnectionSummary {
  const scope = getMcpScopeFromConnection(connection);
  return {
    agentProfileId: connection.agentProfileId,
    scope: getMcpScopeRef(scope),
    alwaysAllowEnabled: connection.alwaysAllowEnabled,
    authenticatedByUserId: connection.authenticatedByUserId,
    authMethod: connection.authMethod as "oauth" | "headers",
    catalogId: connection.catalogId,
    endpointUrl: connection.endpointUrl,
    id: connection.id,
    lastDiscoveredAt: connection.lastDiscoveredAt?.toISOString() ?? null,
    lastErrorCode: connection.lastErrorCode,
    serverLabel: connection.serverLabel,
    state: connection.state as McpConnectionSummary["state"],
  };
}

function scopeConnectionCondition(scope: McpScope) {
  return scope.type === "agent"
    ? and(
        eq(aiMcpConnection.scopeType, "agent"),
        eq(aiMcpConnection.agentProfileId, scope.agentProfileId),
      )
    : and(eq(aiMcpConnection.scopeType, "personal"), eq(aiMcpConnection.scopeUserId, scope.userId));
}

function scopeActivityCondition(scope: McpScope) {
  return scope.type === "agent"
    ? and(
        eq(aiMcpActivity.scopeType, "agent"),
        eq(aiMcpActivity.agentProfileId, scope.agentProfileId),
      )
    : and(eq(aiMcpActivity.scopeType, "personal"), eq(aiMcpActivity.scopeUserId, scope.userId));
}

function sanitizeActivityMetadata(
  value: unknown,
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set([
    "discoveredTools",
    "toolCount",
    "classification",
    "executionMode",
    "schemaChanged",
    "rowCount",
    "durationMs",
  ]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      allowed.has(key) && (item === null || ["string", "number", "boolean"].includes(typeof item))
        ? [[key, item as string | number | boolean | null]]
        : [],
    ),
  );
}

export function toMcpServiceError(error: unknown) {
  if (error instanceof McpServiceError) return error;
  if (error instanceof AgentProfileError) {
    return new McpServiceError(error.code, error.message, error.status);
  }
  if (error instanceof McpEgressError) {
    return new McpServiceError(error.code, error.message, 400);
  }
  return null;
}
