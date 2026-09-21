import type { AgentToolResult } from "@zilobase/features/ai-chat/agent-contract";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../../../../infrastructure/database";
import {
  aiAgentPendingAction,
  aiAgentRun,
  aiAgentToolExecution,
  aiAgentTurn,
  aiChatThread,
  aiMcpConnection,
  aiMcpToolSnapshot,
} from "../../../../infrastructure/database/schema";
import { getStringEnv, type RuntimeEnv } from "../../../../shared/config/config";
import { getMembership } from "../../../access";
import { hashAgentToolInput } from "../../actions/agent-action-receipts";
import { decryptMcpSecret, encryptMcpSecret } from "../connections/credential-crypto";
import { isMcpExternalWritesEnabled } from "../connections/config";
import { discoverConnectionTools, executeMcpTool } from "../transport/mcp-client";
import { getWorkspaceMcpPolicy } from "../connections/mcp-service";
import { findAgentMcpToolGrant } from "./mcp-run-snapshot";
import { readAgentRunCheckpoint } from "../../execution/agent-run-checkpoint";
import {
  getMcpCredentialScopeId,
  getMcpScopeFromConnection,
  isMcpScopeMatch,
  requireMcpScopeAccess,
  type McpScope,
} from "../mcp-scope";

const APPROVAL_TTL_MS = 15 * 60 * 1_000;

export async function requestMcpActionApproval(input: {
  connection: typeof aiMcpConnection.$inferSelect;
  env: RuntimeEnv;
  snapshot: typeof aiMcpToolSnapshot.$inferSelect;
  scope: McpScope;
  threadId?: string | null;
  agentRunId?: string | null;
  toolCallId: string;
  toolInput: unknown;
  userId?: string | null;
  workspaceId: string;
}): Promise<AgentToolResult> {
  const { threadId = null, agentRunId = null } = input;
  if (Boolean(input.threadId) === Boolean(input.agentRunId)) {
    throw new Error(
      "MCP approval must belong to exactly one Ask AI thread or Custom Agent run.",
    );
  }
  if (
    !isMcpScopeMatch(getMcpScopeFromConnection(input.connection), input.scope)
  ) {
    throw new Error("MCP approval connection does not match its chat context.");
  }
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS);
  const inputHash = await hashAgentToolInput(input.toolInput);
  const encrypted = await encryptMcpSecret(
    input.env,
    JSON.stringify(input.toolInput),
    {
      authenticatedByUserId: input.connection.authenticatedByUserId,
      connectionId: input.connection.id,
      profileId: getMcpCredentialScopeId(input.connection),
      purpose: `approval:${id}`,
      workspaceId: input.workspaceId,
    },
  );
  await db
    .insert(aiAgentPendingAction)
    .values({
      agentProfileId:
        input.scope.type === "agent" ? input.scope.agentProfileId : null,
      connectionId: input.connection.id,
      createdAt: now,
      encryptedToolInput: `${encrypted.keyVersion}:${encrypted.ciphertext}`,
      encryptedToolInputAuthTag: encrypted.authTag,
      encryptedToolInputIv: encrypted.iv,
      expiresAt,
      externalToolName: input.snapshot.externalName,
      id,
      inputHash,
      mcpScopeType: input.scope.type,
      mcpScopeUserId:
        input.scope.type === "personal" ? input.scope.userId : null,
      status: "pending",
      threadId,
      agentRunId,
      toolCallId: input.toolCallId,
      toolInput: {},
      toolName: dynamicMcpToolName(input.connection, input.snapshot),
      toolSchemaHash: input.snapshot.schemaHash,
      toolVersion: 1,
      updatedAt: now,
      userId: input.userId,
      workspaceId: input.workspaceId,
    })
    .onConflictDoNothing();
  const [persisted] = await db
    .select()
    .from(aiAgentPendingAction)
    .where(
      and(
        input.threadId
          ? eq(aiAgentPendingAction.threadId, input.threadId)
          : eq(aiAgentPendingAction.agentRunId, input.agentRunId!),
        eq(aiAgentPendingAction.toolCallId, input.toolCallId),
      ),
    )
    .limit(1);
  if (
    !persisted ||
    persisted.inputHash !== inputHash ||
    persisted.connectionId !== input.connection.id
  ) {
    throw new Error("MCP approval request idempotency conflict.");
  }
  return {
    data: {
      approval: {
        actionId: persisted.id,
        expiresAt: persisted.expiresAt.toISOString(),
        provider: input.connection.serverLabel,
        title: input.snapshot.externalName,
        toolName: persisted.toolName,
      },
    },
    ok: false,
    status: "approval_required",
    summary: `${input.connection.serverLabel}: ${input.snapshot.externalName} requires your approval before it can run.`,
  };
}

export async function executeApprovedMcpAction(input: {
  action: typeof aiAgentPendingAction.$inferSelect;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
}) {
  const action = input.action;
  if (
    action.agentRunId &&
    (getStringEnv(input.env, "AI_CUSTOM_AGENTS_ENABLED") !== "true" ||
      getStringEnv(input.env, "AI_CUSTOM_AGENT_EXECUTION_DISABLED") === "true")
  ) {
    throw new Error("Custom Agent execution is disabled.");
  }
  requireApprovalPayload(action);
  const scope: McpScope =
    action.mcpScopeType === "agent" && action.agentProfileId
      ? { type: "agent", agentProfileId: action.agentProfileId }
      : action.mcpScopeType === "personal" && action.mcpScopeUserId
        ? { type: "personal", userId: action.mcpScopeUserId }
        : (() => {
            throw new Error("MCP approval scope is invalid.");
          })();
  await requireMcpScopeAccess({
    minimum: "user",
    scope,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (action.agentRunId)
    return executeApprovedMcpRunAction(input, action, scope);
  if (!action.threadId) throw new Error("MCP approval context is invalid.");
  const [thread] = await db
    .select({
      userId: aiChatThread.userId,
      workspaceId: aiChatThread.workspaceId,
    })
    .from(aiChatThread)
    .where(eq(aiChatThread.id, action.threadId))
    .limit(1);
  if (
    !thread ||
    thread.workspaceId !== input.workspaceId ||
    thread.userId !== input.userId ||
    scope.type !== "personal"
  ) {
    throw new Error("MCP approval does not match its chat context.");
  }
  const context = await loadApprovedMcpTool(input, action, scope);
  const toolInput = await decryptApprovedToolInput(
    input,
    action,
    context.connection,
  );
  const [toolExecution] = await db
    .select({ id: aiAgentToolExecution.id })
    .from(aiAgentToolExecution)
    .where(
      and(
        eq(aiAgentToolExecution.toolCallId, action.toolCallId),
        sql`exists (
        select 1 from ${aiAgentTurn}
        where ${aiAgentTurn.id} = ${aiAgentToolExecution.turnId}
          and ${aiAgentTurn.threadId} = ${action.threadId}
      )`,
      ),
    )
    .limit(1);
  const result = await executeMcpTool({
    expectedPolicy: {
      classification: context.snapshot.classification,
      executionMode: context.snapshot.executionMode,
      alwaysAllowEnabled: context.connection.alwaysAllowEnabled,
    },
    connectionId: context.connection.id,
    env: input.env,
    externalName: context.snapshot.externalName,
    schemaHash: context.snapshot.schemaHash,
    scope,
    threadId: action.threadId,
    toolInput,
    toolExecutionId: toolExecution?.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const outcomeUnknown = result.error?.code === "mcp_write_outcome_unknown";
  const succeeded = result.ok && result.status === "succeeded";
  await db
    .update(aiAgentToolExecution)
    .set({
      approvalActorUserId: input.userId,
      completedAt: new Date(),
      errorCode: succeeded
        ? null
        : (result.error?.code ?? "mcp_approved_action_failed"),
      outcomeUnknown,
      status: succeeded ? "succeeded" : "failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiAgentToolExecution.toolCallId, action.toolCallId),
        sql`exists (
      select 1 from ${aiAgentTurn}
      where ${aiAgentTurn.id} = ${aiAgentToolExecution.turnId}
        and ${aiAgentTurn.threadId} = ${action.threadId}
    )`,
      ),
    );
  return result;
}

async function executeApprovedMcpRunAction(
  input: {
    action: typeof aiAgentPendingAction.$inferSelect;
    env: RuntimeEnv;
    userId: string;
    workspaceId: string;
  },
  action: ApprovalPayload,
  scope: McpScope,
) {
  if (scope.type !== "agent" || !action.agentRunId) {
    throw new Error("Custom Agent MCP approval payload is incomplete.");
  }
  const [run] = await db
    .select()
    .from(aiAgentRun)
    .where(
      and(
        eq(aiAgentRun.id, action.agentRunId),
        eq(aiAgentRun.profileId, scope.agentProfileId),
        eq(aiAgentRun.workspaceId, input.workspaceId),
        eq(aiAgentRun.status, "waiting_approval"),
      ),
    )
    .limit(1);
  if (!run)
    throw new Error("Custom Agent run is no longer waiting for this approval.");
  const checkpoint = await readAgentRunCheckpoint(input.env, run);
  if (!checkpoint.toolCallIds.includes(action.toolCallId))
    throw new Error("Approval has no saved model checkpoint.");
  const context = await loadApprovedMcpTool(input, action, scope);
  if (
    !findAgentMcpToolGrant(run.permissionSnapshot, {
      connectionId: context.connection.id,
      externalName: context.snapshot.externalName,
      schemaHash: context.snapshot.schemaHash,
      classification: context.snapshot.classification,
    })
  )
    throw new Error("MCP tool is not part of this run's captured permissions.");
  const toolInput = await decryptApprovedToolInput(
    input,
    action,
    context.connection,
  );
  const [toolExecution] = await db
    .select({ id: aiAgentToolExecution.id })
    .from(aiAgentToolExecution)
    .where(
      and(
        eq(aiAgentToolExecution.agentRunId, run.id),
        eq(aiAgentToolExecution.toolCallId, action.toolCallId),
      ),
    )
    .limit(1);
  const result = await executeMcpTool({
    expectedPolicy: {
      classification: context.snapshot.classification,
      executionMode: context.snapshot.executionMode,
      alwaysAllowEnabled: context.connection.alwaysAllowEnabled,
    },
    agentRunId: run.id,
    connectionId: context.connection.id,
    env: input.env,
    externalName: context.snapshot.externalName,
    schemaHash: context.snapshot.schemaHash,
    scope,
    toolInput,
    toolExecutionId: toolExecution?.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const completedAt = new Date();
  const succeeded = result.ok && result.status === "succeeded";
  await db.transaction(async (tx) => {
    await tx
      .update(aiAgentToolExecution)
      .set({
        approvalActorUserId: input.userId,
        completedAt,
        errorCode: succeeded
          ? null
          : (result.error?.code ?? "mcp_approved_action_failed"),
        outcomeUnknown: result.error?.code === "mcp_write_outcome_unknown",
        status: succeeded ? "succeeded" : "failed",
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(aiAgentToolExecution.agentRunId, run.id),
          eq(aiAgentToolExecution.toolCallId, action.toolCallId),
        ),
      );
    await tx
      .update(aiAgentPendingAction)
      .set({
        completedAt,
        error: succeeded ? null : result.summary,
        result,
        status: succeeded ? "succeeded" : "failed",
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(aiAgentPendingAction.id, action.id),
          eq(aiAgentPendingAction.status, "executing"),
        ),
      );
  });
  return result;
}

export function isMcpPendingAction(
  action: typeof aiAgentPendingAction.$inferSelect,
) {
  return Boolean(
    action.connectionId && action.externalToolName && action.mcpScopeType,
  );
}

export function dynamicMcpToolName(
  connection: Pick<typeof aiMcpConnection.$inferSelect, "id" | "serverLabel">,
  snapshot: Pick<typeof aiMcpToolSnapshot.$inferSelect, "externalName">,
) {
  return `mcp_${slug(connection.serverLabel)}_${slug(snapshot.externalName)}_${shortHash(`${connection.id}:${snapshot.externalName}`)}`.slice(
    0,
    120,
  );
}

function splitEncryptedPayload(value: string) {
  const index = value.indexOf(":");
  if (index <= 0) throw new Error("Encrypted approval payload is invalid.");
  return [value.slice(0, index), value.slice(index + 1)] as const;
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 32) || "tool"
  );
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

type ApprovalInput = { env: RuntimeEnv; userId: string; workspaceId: string };
type ApprovalPayload = typeof aiAgentPendingAction.$inferSelect & {
  connectionId: string;
  externalToolName: string;
  toolSchemaHash: string;
  encryptedToolInput: string;
  encryptedToolInputIv: string;
  encryptedToolInputAuthTag: string;
};

async function loadApprovedMcpTool(
  input: ApprovalInput,
  action: ApprovalPayload,
  scope: McpScope,
) {
  await discoverConnectionTools({
    connectionId: action.connectionId,
    env: input.env,
  });
  const [context] = await db
    .select({
      connection: aiMcpConnection,
      snapshot: aiMcpToolSnapshot,
    })
    .from(aiMcpConnection)
    .innerJoin(
      aiMcpToolSnapshot,
      and(
        eq(aiMcpToolSnapshot.connectionId, aiMcpConnection.id),
        eq(aiMcpToolSnapshot.externalName, action.externalToolName),
      ),
    )
    .where(
      and(
        eq(aiMcpConnection.id, action.connectionId),
        eq(aiMcpConnection.scopeType, scope.type),
        scope.type === "agent"
          ? eq(aiMcpConnection.agentProfileId, scope.agentProfileId)
          : eq(aiMcpConnection.scopeUserId, scope.userId),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (
    !context ||
    context.connection.state !== "connected" ||
    !context.snapshot.enabled ||
    !context.snapshot.available ||
    context.snapshot.schemaHash !== action.toolSchemaHash
  ) {
    throw new Error(
      "MCP tool or connection changed after approval was requested.",
    );
  }
  if (
    !(await getMembership(
      input.workspaceId,
      context.connection.authenticatedByUserId,
    ))
  ) {
    throw new Error("MCP connection authenticator is no longer active.");
  }
  const policy = await getWorkspaceMcpPolicy(input.workspaceId);
  if (
    context.snapshot.classification !== "read" &&
    (!policy.externalWritesEnabled || !isMcpExternalWritesEnabled(input.env))
  ) {
    throw new Error("External writes are disabled for this workspace.");
  }
  return context;
}

async function decryptApprovedToolInput(
  input: ApprovalInput,
  action: ApprovalPayload,
  connection: typeof aiMcpConnection.$inferSelect,
) {
  const [keyVersion, ciphertext] = splitEncryptedPayload(
    action.encryptedToolInput,
  );
  const plaintext = await decryptMcpSecret(
    input.env,
    {
      authTag: action.encryptedToolInputAuthTag,
      ciphertext,
      iv: action.encryptedToolInputIv,
      keyVersion,
    },
    {
      authenticatedByUserId: connection.authenticatedByUserId,
      connectionId: connection.id,
      profileId: getMcpCredentialScopeId(connection),
      purpose: `approval:${action.id}`,
      workspaceId: input.workspaceId,
    },
  );
  const toolInput = JSON.parse(plaintext) as unknown;
  if ((await hashAgentToolInput(toolInput)) !== action.inputHash) {
    throw new Error("MCP approval arguments failed integrity validation.");
  }
  return toolInput;
}

function requireApprovalPayload(
  action: typeof aiAgentPendingAction.$inferSelect,
): asserts action is ApprovalPayload {
  if (
    !action.mcpScopeType ||
    !action.connectionId ||
    !action.externalToolName ||
    !action.toolSchemaHash ||
    !action.encryptedToolInput ||
    !action.encryptedToolInputIv ||
    !action.encryptedToolInputAuthTag
  ) {
    throw new Error("MCP approval payload is incomplete.");
  }
}
