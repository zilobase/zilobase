import { jsonSchema, tool, type ToolSet } from "ai";
import { and, count, eq, isNotNull } from "drizzle-orm";

import { db } from "../../../../infrastructure/database";
import {
  aiAgentToolExecution,
  aiMcpConnection,
  aiMcpToolSnapshot,
} from "../../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../../shared/config/config";
import { appendRunEvent } from "../../execution/agent-run-records";
import { isMcpEnabled, isMcpExternalWritesEnabled, MCP_LIMITS } from "../connections/config";
import { dynamicMcpToolName, requestMcpActionApproval } from "./mcp-approval";
import { executeMcpTool } from "../transport/mcp-client";
import { agentMcpScope } from "../mcp-scope";
import { findAgentMcpToolGrant } from "./mcp-run-snapshot";
import { getWorkspaceMcpPolicy, recordMcpActivity } from "../connections/mcp-service";

export async function buildMcpAgentRunTools(input: {
  env: RuntimeEnv;
  permissionSnapshot: unknown;
  profileId: string;
  query: string;
  runId: string;
  userId: string | null;
  workspaceId: string;
}) {
  if (!isMcpEnabled(input.env)) return { omitted: 0, tools: {} as ToolSet };
  const scope = agentMcpScope(input.profileId);
  const policy = await getWorkspaceMcpPolicy(input.workspaceId);
  const rows = await db
    .select({ connection: aiMcpConnection, snapshot: aiMcpToolSnapshot })
    .from(aiMcpToolSnapshot)
    .innerJoin(aiMcpConnection, eq(aiMcpConnection.id, aiMcpToolSnapshot.connectionId))
    .where(
      and(
        eq(aiMcpConnection.scopeType, "agent"),
        eq(aiMcpConnection.agentProfileId, input.profileId),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
        eq(aiMcpConnection.state, "connected"),
        eq(aiMcpToolSnapshot.enabled, true),
        eq(aiMcpToolSnapshot.available, true),
      ),
    );
  const externalWritesEnabled =
    policy.externalWritesEnabled && isMcpExternalWritesEnabled(input.env);
  const executable = rows.filter(
    ({ connection, snapshot }) =>
      (snapshot.classification === "read" || externalWritesEnabled) &&
      findAgentMcpToolGrant(input.permissionSnapshot, {
        connectionId: connection.id,
        externalName: snapshot.externalName,
        schemaHash: snapshot.schemaHash,
        classification: snapshot.classification,
      }),
  );
  const selected = executable
    .map((row) => ({
      row,
      score: relevanceScore(
        input.query,
        row.connection.serverLabel,
        row.snapshot.externalName,
        row.snapshot.description,
      ),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.row.snapshot.externalName.localeCompare(right.row.snapshot.externalName),
    )
    .slice(0, MCP_LIMITS.maxModelToolsPerTurn)
    .map(({ row }) => row);
  const [previousCalls] = await db
    .select({ value: count() })
    .from(aiAgentToolExecution)
    .where(
      and(
        eq(aiAgentToolExecution.agentRunId, input.runId),
        isNotNull(aiAgentToolExecution.connectionId),
      ),
    );
  let callCount = Number(previousCalls?.value ?? 0);
  const tools: ToolSet = {};
  for (const { connection, snapshot } of selected) {
    const name = dynamicMcpToolName(connection, snapshot);
    tools[name] = tool({
      description:
        `[Untrusted external tool from ${connection.serverLabel}] ${snapshot.description}`.slice(
          0,
          2_000,
        ),
      inputSchema: jsonSchema(snapshot.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (toolInput, options) => {
        callCount += 1;
        if (callCount > MCP_LIMITS.maxCallsPerTurn) {
          return {
            error: { code: "mcp_call_limit", retryable: false },
            ok: false,
            status: "unavailable",
            summary: "This run reached the connector call limit.",
          };
        }
        const now = new Date();
        const executionId = crypto.randomUUID();
        const [reserved] = await db
          .insert(aiAgentToolExecution)
          .values({
            actualEffect: snapshot.classification,
            agentRunId: input.runId,
            connectionId: connection.id,
            createdAt: now,
            effect: snapshot.classification === "read" ? "read" : "write",
            externalToolName: snapshot.externalName,
            id: executionId,
            schemaHash: snapshot.schemaHash,
            status: "running",
            toolCallId: options.toolCallId,
            toolName: name,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: aiAgentToolExecution.id });
        if (!reserved) throw new Error("Agent tool call already has a durable execution receipt.");
        await appendRunEvent(input.runId, "tool_started", "shared", {
          provider: connection.serverLabel,
          tool: snapshot.externalName,
        });
        const mustAsk = requiresRunApproval(input.permissionSnapshot, connection, snapshot);
        const result = mustAsk
          ? await requestMcpActionApproval({
              agentRunId: input.runId,
              connection,
              env: input.env,
              scope,
              snapshot,
              toolCallId: options.toolCallId,
              toolInput,
              userId: input.userId ?? connection.authenticatedByUserId,
              workspaceId: input.workspaceId,
            })
          : await executeMcpTool({
              expectedPolicy: {
                classification: snapshot.classification,
                executionMode: snapshot.executionMode,
                alwaysAllowEnabled: connection.alwaysAllowEnabled,
              },
              agentRunId: input.runId,
              connectionId: connection.id,
              env: input.env,
              externalName: snapshot.externalName,
              schemaHash: snapshot.schemaHash,
              scope,
              toolExecutionId: executionId,
              toolInput,
              userId: input.userId,
              workspaceId: input.workspaceId,
            });
        await finishRunToolReceipt(executionId, result, mustAsk);
        const outcome = result.ok ? "succeeded" : result.status;
        if (mustAsk) {
          // The processor pauses only after all results from this model step
          // are checkpointed. Approval execution cannot race that checkpoint.
          await appendRunEvent(input.runId, "approval_required", "shared", {
            provider: connection.serverLabel,
            tool: snapshot.externalName,
          });
        } else {
          await appendRunEvent(input.runId, "tool_completed", "shared", {
            outcome,
            provider: connection.serverLabel,
            tool: snapshot.externalName,
          });
        }
        await recordMcpActivity({
          actorUserId: input.userId,
          connectionId: connection.id,
          eventType: mustAsk ? "tool_approval_requested" : "tool_invoked",
          metadata: {
            classification: snapshot.classification,
            executionMode: snapshot.executionMode,
          },
          outcome,
          providerLabel: connection.serverLabel,
          scope,
          toolName: snapshot.externalName,
          workspaceId: input.workspaceId,
        });
        return result;
      },
    });
  }
  return { omitted: Math.max(0, executable.length - selected.length), tools };
}

function relevanceScore(query: string, ...fields: string[]) {
  const terms = new Set(query.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? []);
  const haystack = fields.join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += 1;
  return score;
}

function requiresRunApproval(
  permissionSnapshot: unknown,
  connection: typeof aiMcpConnection.$inferSelect,
  snapshot: typeof aiMcpToolSnapshot.$inferSelect,
) {
  const grant = findAgentMcpToolGrant(permissionSnapshot, {
    connectionId: connection.id,
    externalName: snapshot.externalName,
    schemaHash: snapshot.schemaHash,
    classification: snapshot.classification,
  });
  return (
    grant?.requiresApproval ||
    (snapshot.executionMode === "always_ask" && !connection.alwaysAllowEnabled)
  );
}

async function finishRunToolReceipt(
  executionId: string,
  result: Awaited<ReturnType<typeof executeMcpTool>>,
  mustAsk: boolean | undefined,
) {
  const completedAt = new Date();
  await db
    .update(aiAgentToolExecution)
    .set({
      completedAt: mustAsk ? null : completedAt,
      errorCode: result.ok ? null : (result.error?.code ?? null),
      outcomeUnknown: result.error?.code === "mcp_write_outcome_unknown",
      status: mustAsk ? "running" : result.ok ? "succeeded" : "failed",
      updatedAt: completedAt,
    })
    .where(eq(aiAgentToolExecution.id, executionId));
}
