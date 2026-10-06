import { and, eq } from "drizzle-orm";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import {
  dispatchBackgroundTasks,
  backgroundTransaction,
} from "../../../infrastructure/background/dispatch";
import { db } from "../../../infrastructure/database";
import { aiAgentProfile, aiAgentRun } from "../../../infrastructure/database/schema";
import { getStringEnv, type RuntimeEnv } from "../../../shared/config/config";
import { AgentProfileError } from "../agents/agent-profile-service";
import { listAgentResourcesForExecution } from "../agents/agent-resource-service";
import { appendRunEvent, serializeRun } from "./agent-run-records";
import { captureAgentMcpToolGrants } from "../mcp/execution/mcp-run-snapshot";

export const RESOURCE_EDITOR_PAUSE_REASON =
  "Agent execution is paused because a granted resource no longer has an active agent editor with sufficient human access.";

export async function enqueueAgentRun(input: {
  chainDepth?: number;
  env?: RuntimeEnv;
  input: Record<string, unknown>;
  initiatedByUserId?: string | null;
  occurrenceKey?: string | null;
  profileId: string;
  revisionId?: string;
  triggerId?: string | null;
  triggerKind: typeof aiAgentRun.$inferInsert.triggerKind;
  workspaceId: string;
}) {
  return backgroundTransaction(input.env ?? {}, () => enqueueAgentRunInTransaction(input));
}

async function enqueueAgentRunInTransaction(input: Parameters<typeof enqueueAgentRun>[0]) {
  const { initiatedByUserId = null, occurrenceKey = null, triggerId = null } = input;
  const profile = await requireRunnableProfile(input);
  const resources = await captureRunnableResources(input, profile);
  const now = new Date();
  const id = crypto.randomUUID();
  const mcpTools = await captureAgentMcpToolGrants(input.profileId, input.workspaceId);
  const [inserted] = await db
    .insert(aiAgentRun)
    .values({
      availableAt: now,
      chainDepth: input.chainDepth ?? 0,
      createdAt: now,
      id,
      initiatedByUserId,
      input: input.input,
      occurrenceKey,
      permissionSnapshot: {
        capturedAt: now.toISOString(),
        mcpTools,
        resources: resources.map(({ accessLevel, resourceId, resourceType }) => ({
          accessLevel,
          resourceId,
          resourceType,
        })),
      },
      profileId: input.profileId,
      revisionId: input.revisionId ?? profile.currentRevisionId,
      status: "queued",
      triggerId,
      triggerKind: input.triggerKind,
      updatedAt: now,
      workspaceId: input.workspaceId,
    })
    .onConflictDoNothing()
    .returning({ id: aiAgentRun.id });
  const [run] = input.occurrenceKey
    ? await db
        .select()
        .from(aiAgentRun)
        .where(
          and(
            eq(aiAgentRun.profileId, input.profileId),
            eq(aiAgentRun.occurrenceKey, input.occurrenceKey),
          ),
        )
        .limit(1)
    : await db.select().from(aiAgentRun).where(eq(aiAgentRun.id, id)).limit(1);
  if (!run) throw new Error("Unable to reserve Custom Agent run.");
  if (inserted)
    await appendRunEvent(run.id, "queued", "shared", {
      triggerKind: run.triggerKind,
    });
  if (run.status === "queued") {
    await dispatchBackgroundTasks(input.env ?? {}, [
      createBackgroundTask({
        availableAt: run.availableAt,
        env: input.env ?? {},
        kind: "agent.run",
        resourceId: run.id,
      }),
    ]);
  }
  return serializeRun(run);
}

async function requireRunnableProfile(input: Parameters<typeof enqueueAgentRun>[0]) {
  if ((input.chainDepth ?? 0) > 8) {
    throw new AgentProfileError(
      "agent_chain_depth_exceeded",
      "Agent trigger chain is too deep.",
      409,
    );
  }
  const [profile] = await db
    .select()
    .from(aiAgentProfile)
    .where(
      and(
        eq(aiAgentProfile.id, input.profileId),
        eq(aiAgentProfile.workspaceId, input.workspaceId),
        eq(aiAgentProfile.status, "active"),
      ),
    )
    .limit(1);
  if (!profile?.currentRevisionId)
    throw new AgentProfileError("agent_not_ready", "Agent has no active revision.", 409);
  if (
    profile.executionDisabledReason &&
    profile.executionDisabledReason !== RESOURCE_EDITOR_PAUSE_REASON
  ) {
    throw new AgentProfileError("agent_execution_paused", profile.executionDisabledReason, 409);
  }
  if (getStringEnv(input.env ?? {}, "AI_CUSTOM_AGENT_EXECUTION_DISABLED") === "true") {
    throw new AgentProfileError(
      "agent_execution_disabled",
      "Custom Agent execution is temporarily disabled.",
      503,
    );
  }
  return { ...profile, currentRevisionId: profile.currentRevisionId };
}

async function captureRunnableResources(
  input: Parameters<typeof enqueueAgentRun>[0],
  profile: typeof aiAgentProfile.$inferSelect,
) {
  const resources = await listAgentResourcesForExecution({
    profileId: input.profileId,
    workspaceId: input.workspaceId,
  });
  if (resources.some((resource) => resource.eligibleEditorCount === 0)) {
    await db
      .update(aiAgentProfile)
      .set({
        executionDisabledReason: RESOURCE_EDITOR_PAUSE_REASON,
        updatedAt: new Date(),
      })
      .where(eq(aiAgentProfile.id, input.profileId));
    throw new AgentProfileError("agent_resource_access_paused", RESOURCE_EDITOR_PAUSE_REASON, 409);
  }
  if (profile.executionDisabledReason === RESOURCE_EDITOR_PAUSE_REASON) {
    await db
      .update(aiAgentProfile)
      .set({ executionDisabledReason: null, updatedAt: new Date() })
      .where(eq(aiAgentProfile.id, input.profileId));
  }
  return resources;
}
