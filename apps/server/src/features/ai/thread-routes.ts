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
} from "../../ai/chat-persistence";
import { getMembership } from "../../access";
import type { AppBindings } from "../../types";

const createThreadSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

const renameThreadSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const aiThreadRoutes = new Hono<AppBindings>();

aiThreadRoutes.get("/threads", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const threads = await listAiChatThreads(auth.workspaceId, auth.user.id);

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

  const messages = await loadAiChatThreadMessages(thread.id);

  return c.json({
    messages: messages as UIMessage[],
    thread: serializeThread(thread),
  });
});

async function requireActiveWorkspace(c: Context<AppBindings>) {
  const user = c.get("user");
  const session = c.get("session");
  const workspaceId =
    session?.activeWorkspaceId ??
    c.req.header("x-notelab-workspace-id")?.trim();

  if (!user) {
    return { response: c.json({ error: "Unauthorized" }, 401) };
  }

  if (!workspaceId) {
    return { response: c.json({ error: "No active workspace" }, 409) };
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return { response: c.json({ error: "Forbidden" }, 403) };
  }

  return { workspaceId, user };
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
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}) {
  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastActivityAt: thread.lastActivityAt.toISOString(),
  };
}
