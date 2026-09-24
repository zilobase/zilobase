import { jsonSchema, tool, type ToolSet } from "ai";
import { and, eq } from "drizzle-orm";

import { db } from "../../../../infrastructure/database";
import {
  aiMcpConnection,
  aiMcpToolSnapshot,
  aiAgentToolExecution,
} from "../../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../../shared/config/config";
import type { AgentProgressPublisher } from "../../conversations/agent-progress";
import { isMcpEnabled, isMcpExternalWritesEnabled, MCP_LIMITS } from "../connections/config";
import { requestMcpActionApproval, dynamicMcpToolName } from "./mcp-approval";
import { executeMcpTool, type McpExecutionDescriptor } from "../transport/mcp-client";
import { getWorkspaceMcpPolicy, recordMcpActivity } from "../connections/mcp-service";
import { agentMcpScope, personalMcpScope } from "../mcp-scope";

export async function buildMcpAgentTools(input: {
  agentProfileId: string | null;
  agentTurnId: string;
  env: RuntimeEnv;
  progress?: AgentProgressPublisher;
  query: string;
  threadId: string;
  userId: string;
  withDb<T>(fn: () => Promise<T>): Promise<T>;
  workspaceId: string;
}) {
  const auditDescriptors = new Map<string, McpExecutionDescriptor>();
  if (!isMcpEnabled(input.env)) {
    return { auditDescriptors, omitted: 0, tools: {} as ToolSet };
  }
  const scope = input.agentProfileId
    ? agentMcpScope(input.agentProfileId)
    : personalMcpScope(input.userId);
  const policy = await getWorkspaceMcpPolicy(input.workspaceId);
  const rows = await db
    .select({
      connection: aiMcpConnection,
      snapshot: aiMcpToolSnapshot,
    })
    .from(aiMcpToolSnapshot)
    .innerJoin(aiMcpConnection, eq(aiMcpConnection.id, aiMcpToolSnapshot.connectionId))
    .where(
      and(
        eq(aiMcpConnection.scopeType, scope.type),
        scope.type === "agent"
          ? eq(aiMcpConnection.agentProfileId, scope.agentProfileId)
          : eq(aiMcpConnection.scopeUserId, scope.userId),
        eq(aiMcpConnection.workspaceId, input.workspaceId),
        eq(aiMcpConnection.state, "connected"),
        eq(aiMcpToolSnapshot.enabled, true),
        eq(aiMcpToolSnapshot.available, true),
      ),
    );
  const externalWritesEnabled =
    policy.externalWritesEnabled && isMcpExternalWritesEnabled(input.env);
  const executable = rows.filter(
    ({ snapshot }) => snapshot.classification === "read" || externalWritesEnabled,
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
        left.row.snapshot.externalName.localeCompare(right.row.snapshot.externalName) ||
        left.row.connection.id.localeCompare(right.row.connection.id),
    )
    .slice(0, MCP_LIMITS.maxModelToolsPerTurn)
    .map(({ row }) => row);
  let callCount = 0;
  const tools: ToolSet = {};
  for (const { connection, snapshot } of selected) {
    const namespacedName = dynamicMcpToolName(connection, snapshot);
    const descriptor: McpExecutionDescriptor = {
      classification: snapshot.classification as McpExecutionDescriptor["classification"],
      connectionId: connection.id,
      executionMode: snapshot.executionMode as McpExecutionDescriptor["executionMode"],
      externalName: snapshot.externalName,
      namespacedName,
      schemaHash: snapshot.schemaHash,
    };
    auditDescriptors.set(namespacedName, descriptor);
    tools[namespacedName] = tool({
      description:
        `[Untrusted external tool from ${connection.serverLabel}] ${snapshot.description}`.slice(
          0,
          2_000,
        ),
      inputSchema: jsonSchema(snapshot.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (toolInput, options) => {
        input.progress?.startTool({
          title: `${connection.serverLabel}: ${snapshot.externalName}`,
          toolCallId: options.toolCallId,
          toolName: namespacedName,
        });
        try {
          callCount += 1;
          if (callCount > MCP_LIMITS.maxCallsPerTurn) {
            return unavailable(
              "mcp_call_limit",
              "This turn reached the eight-call connector limit.",
            );
          }
          const alwaysAllowed = connection.alwaysAllowEnabled;
          const mustAsk = snapshot.executionMode === "always_ask" && !alwaysAllowed;
          const [execution] = await input.withDb(() =>
            db
              .select({ id: aiAgentToolExecution.id })
              .from(aiAgentToolExecution)
              .where(
                and(
                  eq(aiAgentToolExecution.turnId, input.agentTurnId),
                  eq(aiAgentToolExecution.toolCallId, options.toolCallId),
                ),
              )
              .limit(1),
          );
          const result = mustAsk
            ? await input.withDb(() =>
                requestMcpActionApproval({
                  connection,
                  env: input.env,
                  scope,
                  snapshot,
                  threadId: input.threadId,
                  toolCallId: options.toolCallId,
                  toolInput,
                  userId: input.userId,
                  workspaceId: input.workspaceId,
                }),
              )
            : await input.withDb(() =>
                executeMcpTool({
                  expectedPolicy: {
                    classification: snapshot.classification,
                    executionMode: snapshot.executionMode,
                    alwaysAllowEnabled: connection.alwaysAllowEnabled,
                  },
                  connectionId: connection.id,
                  env: input.env,
                  externalName: snapshot.externalName,
                  schemaHash: snapshot.schemaHash,
                  scope,
                  threadId: input.threadId,
                  toolInput,
                  toolExecutionId: execution?.id,
                  userId: input.userId,
                  workspaceId: input.workspaceId,
                }),
              );
          await input.withDb(() =>
            recordMcpActivity({
              actorUserId: input.userId,
              connectionId: connection.id,
              eventType: mustAsk ? "tool_approval_requested" : "tool_invoked",
              metadata: {
                classification: snapshot.classification,
                executionMode: snapshot.executionMode,
              },
              outcome:
                result.error?.code === "mcp_write_outcome_unknown"
                  ? "outcome_unknown"
                  : result.ok
                    ? "succeeded"
                    : result.status,
              providerLabel: connection.serverLabel,
              scope,
              toolName: snapshot.externalName,
              workspaceId: input.workspaceId,
            }),
          );
          return result;
        } finally {
          input.progress?.finishTool({ toolCallId: options.toolCallId });
        }
      },
    });
  }
  return {
    auditDescriptors,
    omitted: Math.max(0, executable.length - selected.length),
    tools,
  };
}

function relevanceScore(query: string, ...fields: string[]) {
  const terms = new Set(query.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? []);
  const haystack = fields.join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += 1;
  return score;
}

function unavailable(code: string, summary: string) {
  return { error: { code, retryable: false }, ok: false, status: "unavailable" as const, summary };
}
