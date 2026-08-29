import type { UIMessage } from "ai";
import { Hono } from "hono";
import type { Context } from "hono";
import * as z from "zod";

import {
  archiveAiChatThread,
  createAiChatThread,
  deleteAiChatThread,
  getAiChatThreadForUser,
  listAiChatThreads,
  loadAiChatThreadMessages,
  renameAiChatThread,
  setAiChatThreadPinned,
} from "../../ai/chat-persistence";
import {
  AI_AGENT_INSTRUCTIONS_MAX_CHARS,
  AI_CHAT_FEEDBACK_REASON_MAX_CHARS,
  getAiAgentPreference,
  listAiChatFeedback,
  saveAiAgentPreference,
  saveAiChatFeedback,
} from "../../ai/agent-experience";
import {
  listAiAgentToolExecutions,
  listAiAgentTurnsForWorkspace,
  readAiAgentLimits,
} from "../../ai/agent-operations";
import { getMembership, isPrivilegedOrgRole } from "../access";
import type { AppBindings } from "../../shared/types";

const createThreadSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

const renameThreadSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const pinThreadSchema = z.object({ pinned: z.boolean() });
const preferenceSchema = z.object({
  instructions: z.string().max(AI_AGENT_INSTRUCTIONS_MAX_CHARS),
  responseStyle: z.enum(["concise", "balanced", "detailed"]),
});
const feedbackSchema = z.object({
  rating: z.union([z.literal(-1), z.literal(1)]),
  reason: z.string().trim().max(AI_CHAT_FEEDBACK_REASON_MAX_CHARS).optional(),
});

export const aiThreadRoutes = new Hono<AppBindings>();

aiThreadRoutes.get("/operations/limits", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const limits = readAiAgentLimits(c.env);
  return c.json({
    limits: {
      auditRetentionDays: limits.auditRetentionDays,
      maxArtifactBytesPerUserPerDay: limits.maxArtifactBytesPerUserPerDay,
      maxArtifactsPerUserPerDay: limits.maxArtifactsPerUserPerDay,
      maxConcurrentTurnsPerUser: limits.maxConcurrentTurnsPerUser,
      maxConcurrentTurnsPerWorkspace: limits.maxConcurrentTurnsPerWorkspace,
      maxFilesPerTurn: limits.maxFilesPerTurn,
      maxInputCharacters: limits.maxInputCharacters,
      maxInputMessages: limits.maxInputMessages,
      maxOutputTokens: limits.maxOutputTokens,
      maxSteps: limits.maxSteps,
      maxTokensPerUserPerDay: limits.maxTokensPerUserPerDay,
      maxTurnsPerUserPerDay: limits.maxTurnsPerUserPerDay,
      maxUploadBytesPerUserPerDay: limits.maxUploadBytesPerUserPerDay,
      turnTimeoutMs: limits.turnTimeoutMs,
    },
  });
});

aiThreadRoutes.get("/operations/turns", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  if (!isPrivilegedOrgRole(auth.membership.role)) {
    return c.json({ error: "Only workspace admins can view AI audit data." }, 403);
  }

  const requestedLimit = Number(c.req.query("limit"));
  const turns = await listAiAgentTurnsForWorkspace({
    limit: Number.isSafeInteger(requestedLimit) ? requestedLimit : undefined,
    workspaceId: auth.workspaceId,
  });

  return c.json({
    turns: turns.map((turn) => ({
      ...turn,
      completedAt: turn.completedAt?.toISOString() ?? null,
      startedAt: turn.startedAt.toISOString(),
    })),
  });
});

aiThreadRoutes.get("/operations/turns/:turnId/tools", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  if (!isPrivilegedOrgRole(auth.membership.role)) {
    return c.json({ error: "Only workspace admins can view AI audit data." }, 403);
  }

  const tools = await listAiAgentToolExecutions({
    turnId: c.req.param("turnId"),
    workspaceId: auth.workspaceId,
  });

  return c.json({
    tools: tools.map((tool) => ({
      ...tool,
      completedAt: tool.completedAt?.toISOString() ?? null,
    })),
  });
});

aiThreadRoutes.get("/threads", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const threads = await listAiChatThreads(
    auth.workspaceId,
    auth.user.id,
    c.req.query("q"),
  );

  return c.json({
    threads: threads.map(serializeThread),
  });
});

aiThreadRoutes.post("/threads", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await parseJson(c, createThreadSchema);

  if (!body.success) {
    return body.response;
  }

  const thread = await createAiChatThread({
    workspaceId: auth.workspaceId,
    title: body.data.title,
    userId: auth.user.id,
  });

  if (!thread) {
    return c.json({ error: "Failed to create AI thread" }, 500);
  }

  return c.json({ thread: serializeThread(thread) }, 201);
});

aiThreadRoutes.patch("/threads/:threadId", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await parseJson(c, renameThreadSchema);

  if (!body.success) {
    return body.response;
  }

  const thread = await renameAiChatThread({
    workspaceId: auth.workspaceId,
    threadId: c.req.param("threadId"),
    title: body.data.title,
    userId: auth.user.id,
  });

  if (!thread) {
    return c.json({ error: "Thread not found" }, 404);
  }

  return c.json({ thread: serializeThread(thread) });
});

aiThreadRoutes.post("/threads/:threadId/archive", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const archived = await archiveAiChatThread({
    workspaceId: auth.workspaceId,
    threadId: c.req.param("threadId"),
    userId: auth.user.id,
  });

  if (!archived) {
    return c.json({ error: "Thread not found" }, 404);
  }

  return c.json({ success: true });
});

aiThreadRoutes.put("/threads/:threadId/pin", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await parseJson(c, pinThreadSchema);

  if (!body.success) {
    return body.response;
  }

  const thread = await setAiChatThreadPinned({
    pinned: body.data.pinned,
    workspaceId: auth.workspaceId,
    threadId: c.req.param("threadId"),
    userId: auth.user.id,
  });

  if (!thread) {
    return c.json({ error: "Thread not found" }, 404);
  }

  return c.json({ thread: serializeThread(thread) });
});

aiThreadRoutes.delete("/threads/:threadId", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const deleted = await deleteAiChatThread({
    workspaceId: auth.workspaceId,
    threadId: c.req.param("threadId"),
    userId: auth.user.id,
  });

  if (!deleted) {
    return c.json({ error: "Thread not found" }, 404);
  }

  return c.json({ success: true });
});

aiThreadRoutes.get("/threads/:threadId/messages", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const thread = await getAiChatThreadForUser({
    workspaceId: auth.workspaceId,
    threadId: c.req.param("threadId"),
    userId: auth.user.id,
  });

  if (!thread) {
    return c.json({ error: "Thread not found" }, 404);
  }

  const [messages, feedback] = await Promise.all([
    loadAiChatThreadMessages(thread.id),
    listAiChatFeedback({
      threadId: thread.id,
      userId: auth.user.id,
      workspaceId: auth.workspaceId,
    }),
  ]);

  return c.json({
    feedback,
    messages: messages as UIMessage[],
    thread: serializeThread(thread),
  });
});

aiThreadRoutes.put(
  "/threads/:threadId/messages/:messageId/feedback",
  async (c) => {
    const auth = await requireActiveWorkspace(c);

    if ("response" in auth) {
      return auth.response;
    }

    const body = await parseJson(c, feedbackSchema);

    if (!body.success) {
      return body.response;
    }

    const feedback = await saveAiChatFeedback({
      messageId: c.req.param("messageId"),
      rating: body.data.rating,
      reason: body.data.reason,
      threadId: c.req.param("threadId"),
      userId: auth.user.id,
      workspaceId: auth.workspaceId,
    });

    if (!feedback) {
      return c.json({ error: "Assistant message not found" }, 404);
    }

    return c.json({ feedback });
  },
);

aiThreadRoutes.get("/preferences", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  return c.json({
    preference: await getAiAgentPreference({
      userId: auth.user.id,
      workspaceId: auth.workspaceId,
    }),
  });
});

aiThreadRoutes.put("/preferences", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await parseJson(c, preferenceSchema);

  if (!body.success) {
    return body.response;
  }

  return c.json({
    preference: await saveAiAgentPreference({
      ...body.data,
      userId: auth.user.id,
      workspaceId: auth.workspaceId,
    }),
  });
});

async function requireActiveWorkspace(c: Context<AppBindings>) {
  const user = c.get("user");
  const session = c.get("session");
  const workspaceId =
    session?.activeWorkspaceId ??
    c.req.header("x-zilobase-workspace-id")?.trim();

  if (!user) {
    return { response: c.json({ error: "Unauthorized" }, 401) };
  }

  if (!workspaceId) {
    return { response: c.json({ error: "No active workspace" }, 409) };
  }

  const membership = await getMembership(workspaceId, user.id);

  if (!membership) {
    return { response: c.json({ error: "Forbidden" }, 403) };
  }

  return { membership, workspaceId, user };
}

async function parseJson<T extends z.ZodType>(
  c: Context<AppBindings>,
  schema: T,
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; response: Response }
> {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return {
      success: false,
      response: Response.json(
        { code: "BAD_REQUEST", message: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    return {
      success: false,
      response: Response.json(
        {
          code: "VALIDATION_ERROR",
          issues: result.error.issues,
          message: "Invalid request body",
        },
        { status: 400 },
      ),
    };
  }

  return { success: true, data: result.data };
}

function serializeThread(thread: {
  id: string;
  title: string;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}) {
  return {
    id: thread.id,
    title: thread.title,
    pinnedAt: thread.pinnedAt?.toISOString() ?? null,
    pinned: Boolean(thread.pinnedAt),
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastActivityAt: thread.lastActivityAt.toISOString(),
  };
}
