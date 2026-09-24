import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  isInputRequiredResult,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/client";
import type { AgentCitation, AgentToolResult } from "@zilobase/features/ai-chat/agent-contract";
import { and, eq } from "drizzle-orm";

import { db } from "../../../../infrastructure/database";
import {
  aiMcpConnection,
  aiMcpCredential,
  aiMcpDataset,
  aiMcpDatasetChunk,
  aiMcpToolSnapshot,
} from "../../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../../shared/config/config";
import { getMembership } from "../../../access";
import { MCP_LIMITS, isMcpExecutionEnabled } from "../connections/config";
import { isMcpExecutionContextAllowed } from "../execution/mcp-execution-context";
import { decryptMcpSecret } from "../connections/credential-crypto";
import {
  getMcpCredentialScopeId,
  getMcpScopeColumns,
  getMcpScopeFromConnection,
  isMcpScopeMatch,
  type McpScope,
} from "../mcp-scope";
import { createSecureMcpFetch } from "./secure-egress";

type StoredCredential =
  | { kind: "headers"; headers: Array<{ name: string; value: string }> }
  | {
      kind: "oauth";
      accessToken: string;
      refreshToken?: string;
      tokenType?: string;
      expiresAt?: string;
      issuer: string;
      scope?: string;
    };

export type McpExecutionDescriptor = {
  classification: "read" | "write" | "unknown";
  connectionId: string;
  executionMode: "automatic" | "always_ask";
  externalName: string;
  namespacedName: string;
  schemaHash: string;
};

export async function discoverConnectionTools(input: { connectionId: string; env: RuntimeEnv }) {
  const startedAt = performance.now();
  const context = await loadConnectionContext(input.connectionId, input.env);
  const { client, close } = await connectClient(context);
  try {
    const result = await client.listTools();
    await persistToolDiscovery(context.connection, result.tools);
    await db
      .update(aiMcpConnection)
      .set({
        lastDiscoveredAt: new Date(),
        lastErrorCode: null,
        state: "connected",
        updatedAt: new Date(),
      })
      .where(eq(aiMcpConnection.id, input.connectionId));
    recordMcpMetric({
      durationMs: Math.round(performance.now() - startedAt),
      event: "mcp_discovery",
      outcome: "succeeded",
      provider: context.connection.serverLabel,
      toolCount: result.tools.length,
    });
    return result.tools.length;
  } catch (error) {
    await markConnectionFailure(input.connectionId, error);
    recordMcpMetric({
      durationMs: Math.round(performance.now() - startedAt),
      event: "mcp_discovery",
      outcome: error instanceof UnauthorizedError ? "reconnect_required" : "failed",
      provider: context.connection.serverLabel,
    });
    throw error;
  } finally {
    await close();
  }
}

export async function executeMcpTool(input: {
  expectedPolicy: { classification: string; executionMode: string; alwaysAllowEnabled: boolean };
  scope: McpScope;
  connectionId: string;
  env: RuntimeEnv;
  externalName: string;
  schemaHash: string;
  threadId?: string | null;
  agentRunId?: string | null;
  toolInput: unknown;
  toolExecutionId?: string;
  userId?: string | null;
  workspaceId: string;
}): Promise<AgentToolResult> {
  if (Boolean(input.threadId) === Boolean(input.agentRunId)) {
    return failure(
      "mcp_context_invalid",
      "Connector execution must belong to exactly one Ask AI thread or Custom Agent run.",
    );
  }
  if (!isMcpExecutionEnabled(input.env)) {
    return failure(
      "mcp_execution_disabled",
      "External connector execution is temporarily disabled.",
    );
  }
  const context = await loadConnectionContext(input.connectionId, input.env);
  if (
    context.connection.workspaceId !== input.workspaceId ||
    !isMcpScopeMatch(getMcpScopeFromConnection(context.connection), input.scope)
  ) {
    return failure("mcp_connection_forbidden", "Connector is unavailable.");
  }
  const [snapshot] = await db
    .select()
    .from(aiMcpToolSnapshot)
    .where(
      and(
        eq(aiMcpToolSnapshot.connectionId, input.connectionId),
        eq(aiMcpToolSnapshot.externalName, input.externalName),
        eq(aiMcpToolSnapshot.enabled, true),
        eq(aiMcpToolSnapshot.available, true),
      ),
    )
    .limit(1);
  if (!snapshot || snapshot.schemaHash !== input.schemaHash) {
    return failure("mcp_tool_changed", "The connector tool changed and must be reviewed again.");
  }
  if (
    snapshot.classification !== input.expectedPolicy.classification ||
    snapshot.executionMode !== input.expectedPolicy.executionMode ||
    context.connection.alwaysAllowEnabled !== input.expectedPolicy.alwaysAllowEnabled
  ) {
    return failure(
      "mcp_policy_changed",
      "The connector policy changed. Review the tool and try again.",
    );
  }
  if (!(await isMcpExecutionContextAllowed(input, snapshot.classification))) {
    return failure(
      "mcp_context_forbidden",
      "Connector access or execution policy changed. Start a new run or reconnect after reviewing permissions.",
    );
  }

  const { client, close } = await connectClient(context);
  try {
    const attempts = snapshot.classification === "read" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await client.callTool(
          {
            arguments: isRecord(input.toolInput) ? input.toolInput : {},
            name: input.externalName,
          },
          { signal: AbortSignal.timeout(MCP_LIMITS.timeoutMs) },
        );
        if (isInputRequiredResult(result)) {
          return failure(
            "mcp_input_required",
            "This tool needs additional interactive input that Zilobase does not support yet.",
          );
        }
        return await normalizeToolResult(result, {
          ...input,
          classification: snapshot.classification,
          connection: context.connection,
        });
      } catch (error) {
        if (attempt + 1 < attempts && isAmbiguousNetworkError(error)) continue;
        await markConnectionFailure(input.connectionId, error);
        if (snapshot.classification !== "read" && isAmbiguousNetworkError(error)) {
          return {
            error: { code: "mcp_write_outcome_unknown", retryable: false },
            ok: false,
            status: "failed",
            summary:
              "The provider may have accepted this action, but no receipt was returned. Check the external product before retrying.",
          };
        }
        return failure(
          error instanceof UnauthorizedError ? "mcp_reconnect_required" : "mcp_tool_failed",
          error instanceof UnauthorizedError
            ? "The connector must be reconnected."
            : "The external connector tool failed.",
          snapshot.classification === "read",
        );
      }
    }
    return failure("mcp_tool_failed", "The external connector tool failed.");
  } finally {
    await close();
  }
}

async function connectClient(context: Awaited<ReturnType<typeof loadConnectionContext>>) {
  const headers = credentialHeaders(context.credential);
  const client = new Client(
    { name: "zilobase", version: "0.0.55" },
    {
      capabilities: {},
      inputRequired: { autoFulfill: false },
      versionNegotiation: { mode: "auto" },
    },
  );
  const transport = new StreamableHTTPClientTransport(new URL(context.connection.endpointUrl), {
    fetch: createSecureMcpFetch({
      approvedUrls: new Set([context.connection.endpointUrl]),
      timeoutMs: MCP_LIMITS.timeoutMs,
    }),
    onInsufficientScope: "throw",
    requestInit: { headers },
  });
  try {
    await client.connect(transport, { signal: AbortSignal.timeout(MCP_LIMITS.timeoutMs) });
  } catch (error) {
    await client.close().catch(() => undefined);
    await markConnectionFailure(context.connection.id, error);
    throw error;
  }
  return {
    client,
    close: async () => {
      try {
        await client.close();
      } catch {
        // The request result is authoritative; close failures are non-fatal.
      }
    },
  };
}

async function loadConnectionContext(connectionId: string, env: RuntimeEnv) {
  const [row] = await db
    .select({
      connection: aiMcpConnection,
      credential: aiMcpCredential,
    })
    .from(aiMcpConnection)
    .innerJoin(aiMcpCredential, eq(aiMcpCredential.connectionId, aiMcpConnection.id))
    .where(eq(aiMcpConnection.id, connectionId))
    .limit(1);
  if (
    !row ||
    row.connection.state === "disabled" ||
    row.connection.state === "reconnect_required"
  ) {
    throw new Error("MCP connection is not available.");
  }
  if (!(await getMembership(row.connection.workspaceId, row.connection.authenticatedByUserId))) {
    await db
      .update(aiMcpConnection)
      .set({
        lastErrorCode: "authenticator_inactive",
        state: "reconnect_required",
        updatedAt: new Date(),
      })
      .where(eq(aiMcpConnection.id, connectionId));
    throw new Error("MCP connection authenticator is no longer active.");
  }
  const plaintext = await decryptMcpSecret(
    env,
    {
      authTag: row.credential.authTag,
      ciphertext: row.credential.ciphertext,
      iv: row.credential.iv,
      keyVersion: row.credential.keyVersion,
    },
    {
      authenticatedByUserId: row.connection.authenticatedByUserId,
      connectionId: row.connection.id,
      profileId: getMcpCredentialScopeId(row.connection),
      purpose: row.credential.secretPurpose,
      workspaceId: row.connection.workspaceId,
    },
  );
  let credential = JSON.parse(plaintext) as StoredCredential;
  if (
    credential.kind === "oauth" &&
    credential.refreshToken &&
    credential.expiresAt &&
    Date.parse(credential.expiresAt) <= Date.now() + 60_000
  ) {
    try {
      const { refreshStoredMcpOAuthCredential } = await import("../connections/oauth-credentials");
      credential = await refreshStoredMcpOAuthCredential({
        connection: row.connection,
        credential: { ...credential, refreshToken: credential.refreshToken },
        env,
      });
    } catch {
      await db
        .update(aiMcpConnection)
        .set({
          lastErrorCode: "oauth_refresh_failed",
          state: "reconnect_required",
          updatedAt: new Date(),
        })
        .where(eq(aiMcpConnection.id, connectionId));
      throw new Error("MCP OAuth credential refresh failed; reconnect is required.");
    }
  }
  return { connection: row.connection, credential };
}

function credentialHeaders(credential: StoredCredential) {
  if (credential.kind === "headers") {
    return Object.fromEntries(credential.headers.map((header) => [header.name, header.value]));
  }
  return {
    authorization: `${credential.tokenType ?? "Bearer"} ${credential.accessToken}`,
  };
}

async function persistToolDiscovery(
  connection: typeof aiMcpConnection.$inferSelect,
  tools: Tool[],
) {
  if (tools.length > 1_000) throw new Error("MCP server returned too many tools.");
  const now = new Date();
  const discovered = await Promise.all(
    tools.map(async (tool) => {
      const schemaHash = await hashJson(tool.inputSchema);
      const suggestedRead =
        tool.annotations?.readOnlyHint === true &&
        tool.annotations?.destructiveHint !== true &&
        tool.annotations?.openWorldHint !== true;
      return { schemaHash, suggestedRead, tool };
    }),
  );
  await db.transaction(async (tx) => {
    await tx
      .update(aiMcpToolSnapshot)
      .set({ available: false, updatedAt: now })
      .where(eq(aiMcpToolSnapshot.connectionId, connection.id));
    for (const item of discovered) {
      const [existing] = await tx
        .select()
        .from(aiMcpToolSnapshot)
        .where(
          and(
            eq(aiMcpToolSnapshot.connectionId, connection.id),
            eq(aiMcpToolSnapshot.externalName, item.tool.name),
          ),
        )
        .limit(1);
      if (!existing) {
        await tx.insert(aiMcpToolSnapshot).values({
          annotations: item.tool.annotations ?? {},
          available: true,
          classification: item.suggestedRead ? "read" : "unknown",
          connectionId: connection.id,
          createdAt: now,
          description: item.tool.description ?? "",
          discoveredAt: now,
          enabled: false,
          executionMode: item.suggestedRead ? "automatic" : "always_ask",
          externalName: item.tool.name,
          id: crypto.randomUUID(),
          inputSchema: item.tool.inputSchema,
          schemaHash: item.schemaHash,
          updatedAt: now,
        });
        continue;
      }
      const changed = existing.schemaHash !== item.schemaHash;
      await tx
        .update(aiMcpToolSnapshot)
        .set({
          annotations: item.tool.annotations ?? {},
          available: true,
          description: item.tool.description ?? "",
          discoveredAt: now,
          enabled: changed ? false : existing.enabled,
          inputSchema: item.tool.inputSchema,
          schemaHash: item.schemaHash,
          updatedAt: now,
        })
        .where(eq(aiMcpToolSnapshot.id, existing.id));
    }
  });
}

async function normalizeToolResult(
  result: CallToolResult,
  input: {
    scope: McpScope;
    classification: string;
    connection: typeof aiMcpConnection.$inferSelect;
    connectionId: string;
    externalName: string;
    threadId?: string | null;
    agentRunId?: string | null;
    toolExecutionId?: string;
    userId?: string | null;
    workspaceId: string;
  },
): Promise<AgentToolResult> {
  const content = result.content ?? [];
  const rawText = content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
  const text = rawText.slice(0, 32_000);
  const citations: AgentCitation[] = content
    .flatMap((part, index) => {
      if (part.type !== "resource_link") return [];
      return [
        {
          excerpt: part.description?.slice(0, 500),
          id: `mcp-${input.connectionId}-${index}`,
          source: "external" as const,
          title: part.title ?? part.name,
          url: part.uri,
        },
      ];
    })
    .slice(0, 50);
  const structured = "structuredContent" in result ? result.structuredContent : undefined;
  const dataset = await stageStructuredDataset(structured, input);
  const images = content
    .flatMap((part) =>
      part.type === "image"
        ? [
            {
              byteSize: Math.floor(part.data.length * 0.75),
              mimeType: part.mimeType,
              omittedFromPersistence: true,
            },
          ]
        : [],
    )
    .slice(0, 20);
  recordMcpMetric({
    effect: input.classification,
    event: "mcp_call",
    outcome: result.isError === true ? "failed" : "succeeded",
    provider: input.connection.serverLabel,
    responseBytes:
      new TextEncoder().encode(text).byteLength +
      Number(dataset?.byteSize ?? 0) +
      images.reduce((total, image) => total + image.byteSize, 0),
    tool: input.externalName,
  });
  return {
    citations,
    data: {
      ...(dataset ? { dataset } : {}),
      ...(images.length ? { images } : {}),
      provider: input.connection.serverLabel,
      text,
      textTruncated: rawText.length > text.length,
      tool: input.externalName,
      untrustedExternalContent: true,
    },
    ok: result.isError !== true,
    status: result.isError === true ? "failed" : "succeeded",
    summary:
      result.isError === true
        ? `The ${input.connection.serverLabel} tool returned an error.`
        : `Received data from ${input.connection.serverLabel}.`,
  };
}

async function stageStructuredDataset(
  structured: unknown,
  input: {
    scope: McpScope;
    connectionId: string;
    externalName: string;
    threadId?: string | null;
    agentRunId?: string | null;
    toolExecutionId?: string;
    userId?: string | null;
    workspaceId: string;
  },
) {
  const sourceRows = Array.isArray(structured)
    ? structured
    : isRecord(structured) && Array.isArray(structured.items)
      ? structured.items
      : null;
  if (!sourceRows || !sourceRows.every(isRecord)) return null;
  const rows = sourceRows.slice(0, 10_000).map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .slice(0, 30)
        .map(([key, value]) => [key.slice(0, 120), normalizeCell(value)]),
    ),
  );
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 30);
  const normalized = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column, row[column] ?? null])),
  );
  const serialized = JSON.stringify(normalized);
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > 25 * 1024 * 1024) return null;
  const id = crypto.randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(aiMcpDataset).values({
      ...getMcpScopeColumns(input.scope),
      byteSize: bytes,
      connectionId: input.connectionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      externalToolName: input.externalName,
      id,
      rowCount: normalized.length,
      sample: normalized.slice(0, 20),
      schema: { columns },
      threadId: input.threadId ?? null,
      agentRunId: input.agentRunId ?? null,
      toolExecutionId: input.toolExecutionId,
      truncated: sourceRows.length > normalized.length,
      updatedAt: now,
      userId: input.userId ?? null,
      workspaceId: input.workspaceId,
    });
    for (let offset = 0; offset < normalized.length; offset += 250) {
      const chunk = normalized.slice(offset, offset + 250);
      await tx.insert(aiMcpDatasetChunk).values({
        byteSize: new TextEncoder().encode(JSON.stringify(chunk)).byteLength,
        chunkIndex: offset / 250,
        createdAt: now,
        datasetId: id,
        id: crypto.randomUUID(),
        rowCount: chunk.length,
        rows: chunk,
      });
    }
  });
  return {
    byteSize: bytes,
    connectionId: input.connectionId,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    externalToolName: input.externalName,
    id,
    rowCount: normalized.length,
    sample: normalized.slice(0, 20),
    schema: { columns },
    toolExecutionId: input.toolExecutionId ?? null,
    truncated: sourceRows.length > normalized.length,
  };
}

function normalizeCell(value: unknown): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return truncateUtf8(value, 64 * 1024);
  return truncateUtf8(JSON.stringify(value) ?? String(value), 64 * 1024);
}

function truncateUtf8(value: string, maxBytes: number) {
  const bytes = new TextEncoder().encode(value);
  return bytes.byteLength <= maxBytes ? value : new TextDecoder().decode(bytes.slice(0, maxBytes));
}

async function hashJson(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

async function markConnectionFailure(connectionId: string, error: unknown) {
  const reconnect = error instanceof UnauthorizedError;
  await db
    .update(aiMcpConnection)
    .set({
      lastErrorCode: reconnect ? "unauthorized" : "protocol_or_network_error",
      state: reconnect ? "reconnect_required" : "degraded",
      updatedAt: new Date(),
    })
    .where(eq(aiMcpConnection.id, connectionId));
}

function isAmbiguousNetworkError(error: unknown) {
  return (
    !(error instanceof UnauthorizedError) &&
    (error instanceof TypeError ||
      (error instanceof Error && /network|timeout|socket|abort/i.test(error.message)))
  );
}

function failure(code: string, summary: string, retryable = false): AgentToolResult {
  return { error: { code, retryable }, ok: false, status: "unavailable", summary };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordMcpMetric(metric: Record<string, string | number>) {
  console.info(JSON.stringify(metric));
}
