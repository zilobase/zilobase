import type { McpConnectionScopeRef } from "@zilobase/features/ai-chat/mcp-contract";

import type { aiMcpConnection } from "../../../infrastructure/database/schema";
import { getMembership } from "../../access";
import { requireAgentProfileRole } from "../agents/agent-profile-service";

export type McpScope =
  | { type: "personal"; userId: string }
  | { type: "agent"; agentProfileId: string };

type McpConnectionRow = typeof aiMcpConnection.$inferSelect;

export function personalMcpScope(userId: string): McpScope {
  return { type: "personal", userId };
}

export function agentMcpScope(agentProfileId: string): McpScope {
  return { type: "agent", agentProfileId };
}

export function getMcpScopeFromConnection(
  connection: Pick<McpConnectionRow, "agentProfileId" | "scopeType" | "scopeUserId">,
): McpScope {
  if (connection.scopeType === "agent" && connection.agentProfileId) {
    return agentMcpScope(connection.agentProfileId);
  }
  if (connection.scopeType === "personal" && connection.scopeUserId) {
    return personalMcpScope(connection.scopeUserId);
  }
  throw new Error("MCP connection has an invalid scope.");
}

export function getMcpScopeRef(scope: McpScope): McpConnectionScopeRef {
  return scope.type === "agent"
    ? { type: "agent", agentProfileId: scope.agentProfileId }
    : { type: "personal" };
}

export function getMcpScopeColumns(scope: McpScope) {
  return scope.type === "agent"
    ? {
        agentProfileId: scope.agentProfileId,
        scopeType: "agent" as const,
        scopeUserId: null,
      }
    : {
        agentProfileId: null,
        scopeType: "personal" as const,
        scopeUserId: scope.userId,
      };
}

export function getMcpCredentialScopeId(
  connection: Pick<
    McpConnectionRow,
    "agentProfileId" | "scopeType" | "scopeUserId" | "workspaceId"
  >,
) {
  const scope = getMcpScopeFromConnection(connection);
  return scope.type === "agent"
    ? `agent:${connection.workspaceId}:${scope.agentProfileId}`
    : `personal:${connection.workspaceId}:${scope.userId}`;
}

export function isMcpScopeMatch(left: McpScope, right: McpScope) {
  return left.type === right.type && (
    left.type === "agent"
      ? left.agentProfileId === (right as Extract<McpScope, { type: "agent" }>).agentProfileId
      : left.userId === (right as Extract<McpScope, { type: "personal" }>).userId
  );
}

export async function requireMcpScopeAccess(input: {
  minimum: "user" | "editor";
  scope: McpScope;
  userId: string;
  workspaceId: string;
}) {
  if (input.scope.type === "agent") {
    return requireAgentProfileRole({
      minimum: input.minimum,
      profileId: input.scope.agentProfileId,
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
  }

  if (input.scope.userId !== input.userId) {
    throw new Error("Personal MCP connections are private to their owner.");
  }
  const membership = await getMembership(input.workspaceId, input.userId);
  if (!membership) {
    throw new Error("An active workspace membership is required.");
  }
  return { role: "owner" as const };
}
