import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../../infrastructure/database";
import { aiAgentProfile, aiAgentRun, aiChatThread, aiWorkspaceMcpPolicy } from "../../../../infrastructure/database/schema";
import { getStringEnv, type RuntimeEnv } from "../../../../shared/config/config";
import { isMcpEnabled, isMcpExecutionEnabled, isMcpExternalWritesEnabled } from "../connections/config";
import { findAgentMcpToolGrant } from "./mcp-run-snapshot";
import type { McpScope } from "../mcp-scope";

/** Recheck the durable execution context immediately before external I/O. */
export async function isMcpExecutionContextAllowed(input: {
  agentRunId?: string | null;
  connectionId: string;
  env: RuntimeEnv;
  externalName: string;
  schemaHash: string;
  scope: McpScope;
  threadId?: string | null;
  userId?: string | null;
  workspaceId: string;
}, classification: string) {
  if (!isMcpEnabled(input.env) || !isMcpExecutionEnabled(input.env)) return false;
  if (classification !== "read") {
    if (!isMcpExternalWritesEnabled(input.env)) return false;
    const [policy] = await db.select({ enabled: aiWorkspaceMcpPolicy.externalWritesEnabled })
      .from(aiWorkspaceMcpPolicy).where(eq(aiWorkspaceMcpPolicy.workspaceId, input.workspaceId)).limit(1);
    if (!policy?.enabled) return false;
  }
  if (input.agentRunId) {
    if (input.scope.type !== "agent" ||
        getStringEnv(input.env, "AI_CUSTOM_AGENTS_ENABLED") !== "true" ||
        getStringEnv(input.env, "AI_CUSTOM_AGENT_EXECUTION_DISABLED") === "true") return false;
    const [run] = await db.select({ permissionSnapshot: aiAgentRun.permissionSnapshot })
      .from(aiAgentRun).innerJoin(aiAgentProfile, eq(aiAgentProfile.id, aiAgentRun.profileId))
      .where(and(
        eq(aiAgentRun.id, input.agentRunId),
        eq(aiAgentRun.workspaceId, input.workspaceId),
        eq(aiAgentRun.profileId, input.scope.agentProfileId),
        eq(aiAgentProfile.status, "active"),
        isNull(aiAgentProfile.executionDisabledReason),
        inArray(aiAgentRun.status, ["running", "waiting_approval"]),
      )).limit(1);
    return Boolean(run && findAgentMcpToolGrant(run.permissionSnapshot, {
      classification,
      connectionId: input.connectionId,
      externalName: input.externalName,
      schemaHash: input.schemaHash,
    }));
  }
  if (!input.threadId || input.scope.type !== "personal" || input.scope.userId !== input.userId) return false;
  const [thread] = await db.select({ id: aiChatThread.id })
    .from(aiChatThread).where(and(
      eq(aiChatThread.id, input.threadId),
      eq(aiChatThread.workspaceId, input.workspaceId),
      eq(aiChatThread.userId, input.scope.userId),
    )).limit(1);
  return Boolean(thread);
}
