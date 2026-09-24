import { and, eq } from "drizzle-orm";
import { RESOURCE_EDITOR_PAUSE_REASON } from "./agent-run-queue";

import { db } from "../../../infrastructure/database";
import {
  aiAgentProfile,
  aiAgentRevision,
  aiAgentRun,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";

import type { AgentPermissionSnapshotGrant } from "../../access";
import { buildMcpAgentRunTools } from "../mcp/execution/mcp-run-tools";
import { resolveWorkspaceAiModel } from "../providers/ai-provider";
import { buildAgentNativeRunTools } from "../tools/agent-native-run-tools";

import { listAgentResourcesForExecution } from "../agents/agent-resource-service";

import { PermanentAgentRunError } from "./agent-run-errors";
import { buildAgentConnectionTool } from "../tools/agent-connection-tool";

function readPermissionSnapshot(value: unknown): AgentPermissionSnapshotGrant[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const resources = (value as { resources?: unknown }).resources;
  if (!Array.isArray(resources)) return [];
  return resources.flatMap((resource) => {
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) return [];
    const item = resource as Record<string, unknown>;
    if (
      (item.resourceType !== "page" && item.resourceType !== "database") ||
      typeof item.resourceId !== "string" ||
      !["view", "comment", "edit", "full"].includes(String(item.accessLevel))
    )
      return [];
    return [
      {
        accessLevel: item.accessLevel as AgentPermissionSnapshotGrant["accessLevel"],
        resourceId: item.resourceId,
        resourceType: item.resourceType,
      },
    ];
  });
}

function readRunPrompt(value: unknown) {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const prompt =
    typeof input.prompt === "string"
      ? input.prompt.trim()
      : "Run the saved agent instructions now.";
  const trigger =
    input.triggerPayload === undefined
      ? ""
      : `\n\nTrigger input (untrusted JSON):\n${JSON.stringify(input.triggerPayload).slice(0, 20_000)}`;
  return `${prompt || "Run the saved agent instructions now."}${trigger}`;
}

export async function prepareAgentRun(env: RuntimeEnv, run: typeof aiAgentRun.$inferSelect) {
  const [revision, profile] = await Promise.all([
    db
      .select()
      .from(aiAgentRevision)
      .where(
        and(eq(aiAgentRevision.id, run.revisionId), eq(aiAgentRevision.profileId, run.profileId)),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(aiAgentProfile)
      .where(and(eq(aiAgentProfile.id, run.profileId), eq(aiAgentProfile.status, "active")))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!revision || !profile)
    throw new PermanentAgentRunError(
      "Agent or revision is unavailable.",
      "AGENT_REVISION_UNAVAILABLE",
    );
  if (profile.executionDisabledReason)
    throw new PermanentAgentRunError(profile.executionDisabledReason, "AGENT_ACCESS_PAUSED");
  const liveResources = await listAgentResourcesForExecution({
    profileId: run.profileId,
    workspaceId: run.workspaceId,
  });
  if (liveResources.some((resource) => resource.eligibleEditorCount === 0)) {
    await db
      .update(aiAgentProfile)
      .set({
        executionDisabledReason: RESOURCE_EDITOR_PAUSE_REASON,
        updatedAt: new Date(),
      })
      .where(eq(aiAgentProfile.id, run.profileId));
    throw new PermanentAgentRunError(RESOURCE_EDITOR_PAUSE_REASON, "AGENT_ACCESS_PAUSED");
  }
  const definition = revision.compiledDefinition as {
    defaultModel?: string;
    instructions?: string;
    name?: string;
  };
  const model = await resolveWorkspaceAiModel(run.workspaceId, "auto", env, "chat");
  const prompt = readRunPrompt(run.input);
  const mcpTools = await buildMcpAgentRunTools({
    env,
    permissionSnapshot: run.permissionSnapshot,
    profileId: run.profileId,
    query: prompt,
    runId: run.id,
    userId: run.initiatedByUserId,
    workspaceId: run.workspaceId,
  });
  const nativeTools = {
    ...buildAgentNativeRunTools({
      agentName: definition.name ?? profile.name,
      env,
      permissionSnapshot: readPermissionSnapshot(run.permissionSnapshot),
      profileId: run.profileId,
      runId: run.id,
      workspaceId: run.workspaceId,
    }),
    connectAccount: buildAgentConnectionTool({
      profileId: run.profileId,
      authorUserId: run.initiatedByUserId ?? profile.ownerUserId,
    }),
  };
  return { definition, profile, model, prompt, mcpTools, nativeTools };
}
