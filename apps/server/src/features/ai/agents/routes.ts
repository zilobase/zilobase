import { streamSSE } from "hono/streaming";
import { and, eq, gt } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { requestedAiWorkspaceId } from "../route-workspace";
import * as z from "zod";

import { db, runWithIndependentDbEnv } from "../../../infrastructure/database";
import {
  aiAgentConversationMessage,
  aiAgentPendingAction,
  aiAgentRun,
} from "../../../infrastructure/database/schema";
import { getStringEnv } from "../../../shared/config/config";
import type { AppBindings } from "../../../shared/types";
import { getMembership } from "../../access";
import { finishPendingAgentAction } from "../actions/agent-approvals";
import { executeApprovedMcpAction } from "../mcp/execution/mcp-approval";
import { resumeAgentRunAfterApproval } from "../execution/agent-run-checkpoint";
import {
  listAgentConversation,
  startManualAgentRun,
  submitAgentConversationMessage,
} from "../conversations/agent-conversation-service";
import {
  AgentProfileError,
  archiveAgentProfile,
  createAgentProfile,
  duplicateAgentProfile,
  getAgentProfileDetail,
  getAgentProfileRole,
  listAccessibleAgentProfiles,
  requireAgentProfileRole,
  transferAgentProfileOwnership,
} from "./agent-profile-service";
import {
  grantAgentResource,
  listAgentResources,
  removeAgentResource,
} from "./agent-resource-service";
import {
  listAgentRevisions,
  revertAgentRevision,
} from "./agent-revision-service";
import { appendRunEvent } from "../execution/agent-run-records";
import {
  cancelAgentRun,
  getAgentRunDetail,
  listAgentRuns,
} from "../execution/agent-run-service";
import {
  listAgentTriggers,
  removeAgentTrigger,
  rotateAgentWebhookSecret,
  upsertAgentTrigger,
} from "./agent-trigger-service";

const createSchema = z.object({
  cover: z.string().max(2_000_000).nullable().optional(),
  defaultModel: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.unknown().optional(),
  iconPosition: z.enum(["inline", "top"]).optional(),
  instructions: z.string().max(20_000).optional(),
  name: z.string().trim().min(1).max(120),
});
const transferSchema = z.object({
  newOwnerUserId: z.string().trim().min(1).max(160),
});
const messageSchema = z.object({
  modelId: z.string().min(1).max(160).optional(),
  clientId: z.string().trim().min(1).max(160).optional(),
  message: z.string().trim().min(1).max(20_000),
});
const resourceSchema = z.object({
  accessLevel: z.enum(["view", "comment", "edit"]),
  resourceId: z.string().trim().min(1).max(160),
  resourceType: z.enum(["page", "database"]),
});
const triggerSchema = z.object({
  config: z.record(z.string(), z.unknown()).default({}),
  kind: z.enum([
    "manual",
    "schedule",
    "database",
    "comment",
    "mention",
    "meeting",
    "webhook",
    "slack",
    "connector",
  ]),
  label: z.string().trim().min(1).max(120),
  status: z.enum(["active", "paused", "degraded", "disabled"]).optional(),
});
const runSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000).optional(),
});

export const aiAgentProfileRoutes = new Hono<AppBindings>();

aiAgentProfileRoutes.get("/agents", async (c) =>
  handle(c, async (auth) => ({
    agents: await listAccessibleAgentProfiles(auth),
  })),
);

aiAgentProfileRoutes.post("/agents", async (c) =>
  handle(
    c,
    async (auth) => {
      const body = createSchema.parse(await c.req.json());
      return {
        agent: await createAgentProfile({
          ...body,
          ownerUserId: auth.userId,
          workspaceId: auth.workspaceId,
        }),
      };
    },
    201,
  ),
);

aiAgentProfileRoutes.get("/agents/:agentId", async (c) =>
  handle(c, async (auth) => {
    const agent = await getAgentProfileDetail({
      ...auth,
      profileId: c.req.param("agentId"),
    });
    if (!agent)
      throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
    return { agent };
  }),
);

aiAgentProfileRoutes.post("/agents/:agentId/transfer", async (c) =>
  handle(c, async (auth) => {
    const body = transferSchema.parse(await c.req.json());
    return {
      agent: await transferAgentProfileOwnership({
        ...auth,
        ...body,
        profileId: c.req.param("agentId"),
      }),
    };
  }),
);

aiAgentProfileRoutes.post("/agents/:agentId/archive", async (c) =>
  handle(c, async (auth) => ({
    result: await archiveAgentProfile({
      ...auth,
      profileId: c.req.param("agentId"),
    }),
  })),
);

aiAgentProfileRoutes.post("/agents/:agentId/duplicate", async (c) =>
  handle(
    c,
    async (auth) => ({
      agent: await duplicateAgentProfile({
        ...auth,
        profileId: c.req.param("agentId"),
      }),
    }),
    201,
  ),
);

aiAgentProfileRoutes.get("/agents/:agentId/conversation", async (c) =>
  handle(c, async (auth) => ({
    messages: await listAgentConversation({
      ...auth,
      profileId: c.req.param("agentId"),
    }),
  })),
);

aiAgentProfileRoutes.post("/agents/:agentId/conversation/messages", async (c) =>
  handle(
    c,
    async (auth) => {
      const body = messageSchema.parse(await c.req.json());
      return submitAgentConversationMessage({
        ...auth,
        ...body,
        env: c.env,
        profileId: c.req.param("agentId"),
      });
    },
    201,
  ),
);

aiAgentProfileRoutes.post("/agents/:agentId/conversation/messages/stream", async c => handle(c, async auth => {
  const body = messageSchema.parse(await c.req.json());
  await requireAgentProfileRole({ ...auth, profileId: c.req.param("agentId"), minimum: "user" });
  return streamSSE(
    c,
    (stream) =>
      runWithIndependentDbEnv(c.env, async () => {
        const abort = new AbortController();
        stream.onAbort(() => abort.abort());
        await submitAgentConversationMessage({
          ...auth,
          ...body,
          env: c.env,
          profileId: c.req.param("agentId"),
          abortSignal: abort.signal,
          onSettingsEvent: (event) =>
            stream.writeSSE({ event: "settings", data: JSON.stringify(event) }),
        });
        await stream.writeSSE({ event: "complete", data: "{}" });
      }),
    async (error, stream) => {
      if (stream.aborted) return;
      console.error(
        "Agent conversation request failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error:
            error instanceof AgentProfileError
              ? error.message
              : "Could not complete this request. Please try again.",
        }),
      });
    },
  );
}));

aiAgentProfileRoutes.get("/agents/:agentId/revisions", async (c) =>
  handle(c, async (auth) => ({
    revisions: await listAgentRevisions({
      ...auth,
      profileId: c.req.param("agentId"),
    }),
  })),
);

aiAgentProfileRoutes.post(
  "/agents/:agentId/revisions/:revisionId/revert",
  async (c) =>
    handle(c, async (auth) => ({
      revision: await revertAgentRevision({
        ...auth,
        profileId: c.req.param("agentId"),
        revisionId: c.req.param("revisionId"),
      }),
    })),
);

aiAgentProfileRoutes.get("/agents/:agentId/resources", async (c) =>
  handle(c, async (auth) => ({
    resources: await listAgentResources({
      ...auth,
      profileId: c.req.param("agentId"),
    }),
  })),
);

aiAgentProfileRoutes.put("/agents/:agentId/resources", async (c) =>
  handle(c, async (auth) => {
    const body = resourceSchema.parse(await c.req.json());
    return {
      resources: await grantAgentResource({
        ...auth,
        ...body,
        profileId: c.req.param("agentId"),
      }),
    };
  }),
);

aiAgentProfileRoutes.delete(
  "/agents/:agentId/resources/:resourceId",
  async (c) =>
    handle(c, async (auth) => {
      const resourceType = z
        .enum(["page", "database"])
        .parse(c.req.query("resourceType"));
      return {
        resources: await removeAgentResource({
          ...auth,
          profileId: c.req.param("agentId"),
          resourceId: c.req.param("resourceId"),
          resourceType,
        }),
      };
    }),
);

aiAgentProfileRoutes.get("/agents/:agentId/triggers", async (c) =>
  handle(c, async (auth) => ({
    triggers: await listAgentTriggers({
      ...auth,
      profileId: c.req.param("agentId"),
    }),
  })),
);

aiAgentProfileRoutes.post("/agents/:agentId/triggers", async (c) =>
  handle(
    c,
    async (auth) => {
      if (getStringEnv(c.env, "AI_CUSTOM_AGENT_TRIGGERS_ENABLED") !== "true") {
        throw new AgentProfileError(
          "agent_triggers_disabled",
          "Custom Agent triggers are disabled.",
          404,
        );
      }
      const body = triggerSchema.parse(await c.req.json());
      return upsertAgentTrigger({
        ...auth,
        ...body,
        env: c.env,
        profileId: c.req.param("agentId"),
      });
    },
    201,
  ),
);

aiAgentProfileRoutes.put("/agents/:agentId/triggers/:triggerId", async (c) =>
  handle(c, async (auth) => {
    if (getStringEnv(c.env, "AI_CUSTOM_AGENT_TRIGGERS_ENABLED") !== "true") {
      throw new AgentProfileError(
        "agent_triggers_disabled",
        "Custom Agent triggers are disabled.",
        404,
      );
    }
    const body = triggerSchema.parse(await c.req.json());
    return upsertAgentTrigger({
      ...auth,
      ...body,
      env: c.env,
      profileId: c.req.param("agentId"),
      triggerId: c.req.param("triggerId"),
    });
  }),
);

aiAgentProfileRoutes.delete("/agents/:agentId/triggers/:triggerId", async (c) =>
  handle(c, async (auth) =>
    removeAgentTrigger({
      ...auth,
      profileId: c.req.param("agentId"),
      triggerId: c.req.param("triggerId"),
    }),
  ),
);

aiAgentProfileRoutes.post(
  "/agents/:agentId/triggers/:triggerId/rotate-secret",
  async (c) =>
    handle(c, async (auth) =>
      rotateAgentWebhookSecret({
        ...auth,
        env: c.env,
        profileId: c.req.param("agentId"),
        triggerId: c.req.param("triggerId"),
      }),
    ),
);

aiAgentProfileRoutes.get("/agents/:agentId/runs", async (c) =>
  handle(c, async (auth) => ({
    runs: await listAgentRuns({ ...auth, profileId: c.req.param("agentId") }),
  })),
);

aiAgentProfileRoutes.post("/agents/:agentId/runs", async (c) =>
  handle(
    c,
    async (auth) => {
      const profileId = c.req.param("agentId");
      await requireAgentProfileRole({ ...auth, minimum: "user", profileId });
      const body = runSchema.parse(await c.req.json().catch(() => ({})));
      return {
        run: await startManualAgentRun({
          env: c.env,
          profileId,
          prompt: body.prompt,
          userId: auth.userId,
          workspaceId: auth.workspaceId,
        }),
      };
    },
    201,
  ),
);

aiAgentProfileRoutes.get("/agents/:agentId/runs/:runId", async (c) =>
  handle(c, async (auth) =>
    getAgentRunDetail({
      ...auth,
      profileId: c.req.param("agentId"),
      runId: c.req.param("runId"),
    }),
  ),
);

aiAgentProfileRoutes.get("/agents/:agentId/runs/:runId/approvals", async (c) =>
  handle(c, async (auth) => {
    const profileId = c.req.param("agentId");
    const runId = c.req.param("runId");
    await requireRunApprovalActor({ ...auth, profileId, runId });
    const actions = await db
      .select({
        connectionId: aiAgentPendingAction.connectionId,
        expiresAt: aiAgentPendingAction.expiresAt,
        externalToolName: aiAgentPendingAction.externalToolName,
        id: aiAgentPendingAction.id,
        status: aiAgentPendingAction.status,
        toolName: aiAgentPendingAction.toolName,
      })
      .from(aiAgentPendingAction)
      .where(
        and(
          eq(aiAgentPendingAction.agentRunId, runId),
          eq(aiAgentPendingAction.agentProfileId, profileId),
          eq(aiAgentPendingAction.workspaceId, auth.workspaceId),
          eq(aiAgentPendingAction.status, "pending"),
        ),
      );
    return {
      actions: actions.map((action) => ({
        ...action,
        expiresAt: action.expiresAt.toISOString(),
      })),
    };
  }),
);

aiAgentProfileRoutes.post("/agents/:agentId/runs/:runId/cancel", async (c) =>
  handle(c, async (auth) => ({
    run: await cancelAgentRun({
      ...auth,
      profileId: c.req.param("agentId"),
      runId: c.req.param("runId"),
    }),
  })),
);

aiAgentProfileRoutes.post(
  "/agents/:agentId/runs/:runId/actions/:actionId/approve",
  async (c) =>
    handle(c, async (auth) => {
      const profileId = c.req.param("agentId");
      const runId = c.req.param("runId");
      await requireRunApprovalActor({ ...auth, profileId, runId });
      const now = new Date();
      const [action] = await db
        .update(aiAgentPendingAction)
        .set({
          approvedAt: now,
          status: "executing",
          updatedAt: now,
        })
        .where(
          and(
            eq(aiAgentPendingAction.id, c.req.param("actionId")),
            eq(aiAgentPendingAction.agentRunId, runId),
            eq(aiAgentPendingAction.agentProfileId, profileId),
            eq(aiAgentPendingAction.workspaceId, auth.workspaceId),
            eq(aiAgentPendingAction.status, "pending"),
            gt(aiAgentPendingAction.expiresAt, now),
          ),
        )
        .returning();
      if (!action)
        throw new AgentProfileError(
          "agent_approval_unavailable",
          "Approval is expired or was already handled.",
          409,
        );
      try {
        const result = await executeApprovedMcpAction({
          action,
          env: c.env,
          userId: auth.userId,
          workspaceId: auth.workspaceId,
        });
        await finishPendingAgentAction({
          actionId: action.id,
          ...(result.ok ? { result } : { error: result.summary, result }),
        });
        await resumeAgentRunAfterApproval(c.env, runId);
        return {
          actionId: action.id,
          result,
          status: result.ok ? "succeeded" : "failed",
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Approved connector action failed";
        await finishPendingAgentAction({ actionId: action.id, error: message });
        await resumeAgentRunAfterApproval(c.env, runId);
        throw new AgentProfileError("agent_approval_failed", message, 409);
      }
    }),
);

aiAgentProfileRoutes.post(
  "/agents/:agentId/runs/:runId/actions/:actionId/reject",
  async (c) =>
    handle(c, async (auth) => {
      const profileId = c.req.param("agentId");
      const runId = c.req.param("runId");
      await requireRunApprovalActor({ ...auth, profileId, runId });
      const now = new Date();
      const [action] = await db
        .update(aiAgentPendingAction)
        .set({
          completedAt: now,
          error: "Rejected by an authorized agent user.",
          rejectedAt: now,
          status: "rejected",
          updatedAt: now,
        })
        .where(
          and(
            eq(aiAgentPendingAction.id, c.req.param("actionId")),
            eq(aiAgentPendingAction.agentRunId, runId),
            eq(aiAgentPendingAction.agentProfileId, profileId),
            eq(aiAgentPendingAction.workspaceId, auth.workspaceId),
            eq(aiAgentPendingAction.status, "pending"),
          ),
        )
        .returning();
      if (!action)
        throw new AgentProfileError(
          "agent_approval_unavailable",
          "Approval was already handled.",
          409,
        );
      await db
        .update(aiAgentRun)
        .set({
          completedAt: now,
          errorCode: "AGENT_ACTION_REJECTED",
          errorSummary: "A required action was rejected.",
          leaseExpiresAt: null,
          leaseOwner: null,
          status: "failed",
          updatedAt: now,
        })
        .where(
          and(
            eq(aiAgentRun.id, runId),
            eq(aiAgentRun.status, "waiting_approval"),
          ),
        );
      await db
        .update(aiAgentConversationMessage)
        .set({
          parts: [
            {
              status: "failed",
              text: "Run stopped because a required action was rejected.",
              type: "run",
            },
          ],
          status: "failed",
          updatedAt: now,
        })
        .where(eq(aiAgentConversationMessage.runId, runId));
      await appendRunEvent(runId, "approval_rejected", "shared", {
        actionId: action.id,
        actorUserId: auth.userId,
      });
      return { actionId: action.id, status: "rejected" };
    }),
);

async function requireRunApprovalActor(input: {
  profileId: string;
  runId: string;
  userId: string;
  workspaceId: string;
}) {
  const [run] = await db
    .select({ initiatedByUserId: aiAgentRun.initiatedByUserId })
    .from(aiAgentRun)
    .where(
      and(
        eq(aiAgentRun.id, input.runId),
        eq(aiAgentRun.profileId, input.profileId),
        eq(aiAgentRun.workspaceId, input.workspaceId),
        eq(aiAgentRun.status, "waiting_approval"),
      ),
    )
    .limit(1);
  if (!run)
    throw new AgentProfileError(
      "agent_run_not_found",
      "Agent run not found.",
      404,
    );
  const role = await getAgentProfileRole(input);
  const allowed = run.initiatedByUserId
    ? run.initiatedByUserId === input.userId
    : role === "owner" || role === "editor";
  if (!allowed)
    throw new AgentProfileError(
      "agent_approval_forbidden",
      "You cannot approve this agent run.",
      403,
    );
}

async function handle(
  c: Context<AppBindings>,
  action: (auth: { userId: string; workspaceId: string }) => Promise<unknown>,
  successStatus: 200 | 201 = 200,
) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = requestedAiWorkspaceId(c);
  if (!workspaceId) return c.json({ error: "No active workspace" }, 409);
  if (!(await getMembership(workspaceId, user.id)))
    return c.json({ error: "Forbidden" }, 403);
  if (getStringEnv(c.env, "AI_CUSTOM_AGENTS_ENABLED") !== "true") {
    return c.json(
      {
        code: "AI_CUSTOM_AGENTS_DISABLED",
        error: "Custom Agents are disabled.",
      },
      404,
    );
  }
  const result = await action({ userId: user.id, workspaceId });
  if (result instanceof Response) return result;
  return c.json(result, successStatus);
}
