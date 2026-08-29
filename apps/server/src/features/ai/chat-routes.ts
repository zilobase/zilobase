import { getAgentToolDescriptor } from "@zilobase/features/ai-chat/tool-registry";
import { smoothStream, streamText, type UIMessage } from "ai";
import { Hono } from "hono";
import type { Context } from "hono";
import * as z from "zod";

import { AiProviderConfigError, resolveWorkspaceAiModel } from "../../ai/ai-provider";
import { canAccessPage, getMembership, getPageRecord } from "../access";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { getStringEnv } from "../../shared/config/config";
import type { AppBindings } from "../../shared/types";
import {
  coerceAiChatRequestBody,
  runAiChatTurn,
} from "../../ai/chat-service";
import {
  appendCanonicalUserMessage,
  getAiChatThreadForUser,
  loadAiChatThreadMessages,
} from "../../ai/chat-persistence";
import { getAiAgentTurnByClientId } from "../../ai/agent-operations";
import {
  expirePendingAgentAction,
  finishPendingAgentAction,
  getOwnedPendingAgentAction,
  markPendingAgentActionExecuting,
  rejectPendingAgentAction,
} from "../../ai/agent-approvals";
import { hashAgentToolInput } from "../../ai/agent-action-receipts";
import { buildRegisteredAgentTools } from "../../ai/agent-tool-registry";
import { aiFileRoutes } from "./file-routes";

const editorAiRequestSchema = z.object({
  model: z.string().trim().optional(),
  prompt: z.string().trim().min(1),
  selectedText: z.string().trim().max(20000).optional(),
  skillPageId: z.string().trim().min(1).optional(),
});

const createAgentTurnSchema = z.object({
  attachmentIds: z.array(z.string().trim().min(1)).max(5).default([]),
  clientMessageId: z.string().trim().min(1).max(160),
  clientTurnId: z.string().uuid(),
  contextRefs: z.array(z.object({
    id: z.string().trim().min(1),
    role: z.enum(["primary", "attached"]),
    type: z.enum(["page", "database"]),
  })).max(20).default([]),
  mentionedUserIds: z.array(z.string().trim().min(1)).max(12).default([]),
  modelId: z.string().trim().min(1).max(160).default("auto"),
  text: z.string().trim().min(1).max(100_000),
});

export const aiRoutes = new Hono<AppBindings>();

aiRoutes.route("/", aiFileRoutes);

aiRoutes.post("/chat", async (c) => {
  if (getStringEnv(c.env, "AI_LEGACY_CHAT_ENABLED") !== "true") {
    return c.json({
      code: "LEGACY_CHAT_DISABLED",
      error: "This client uses a retired AI chat protocol. Refresh or update the application.",
    }, 410);
  }
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const rawBody = await readJsonBody(c);

  if (!rawBody || typeof rawBody !== "object") {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const raw = rawBody as Record<string, unknown>;
  const requestedWorkspaceId =
    typeof raw.workspaceId === "string" ? raw.workspaceId.trim() : null;

  if (requestedWorkspaceId && requestedWorkspaceId !== auth.workspaceId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const messages = Array.isArray(raw.messages)
    ? raw.messages as UIMessage[]
    : [];

  if (messages.length === 0) {
    return c.json({ error: "messages is required" }, 400);
  }

  const requestBody = coerceAiChatRequestBody({
    ...raw,
    userId: auth.user.id,
    workspaceId: auth.workspaceId,
  });

  return runAiChatTurn({
    abortSignal: c.req.raw.signal,
    env: c.env,
    messages,
    requestBody,
    withDb: (fn) => runWithDbEnv(c.env, fn),
  });
});

aiRoutes.post("/threads/:threadId/turns", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;

  const body = await parseJson(c, createAgentTurnSchema);
  if (!body.success) return body.response;

  const threadId = c.req.param("threadId");
  const thread = await getAiChatThreadForUser({
    threadId,
    userId: auth.user.id,
    workspaceId: auth.workspaceId,
  });
  if (!thread) return c.json({ error: "Thread not found" }, 404);

  const existingTurn = await getAiAgentTurnByClientId({
    clientTurnId: body.data.clientTurnId,
    threadId,
  });
  if (existingTurn) {
    return c.json({
      code: "TURN_ALREADY_EXISTS",
      error: "This turn was already accepted. Reload the canonical thread.",
      status: existingTurn.status,
      turnId: existingTurn.id,
    }, 409);
  }

  const userMessage = await appendCanonicalUserMessage({
    clientMessageId: body.data.clientMessageId,
    parts: [{ type: "text", text: body.data.text }],
    threadId,
  });
  const messages = await loadAiChatThreadMessages(threadId);
  const pageRefs = body.data.contextRefs.filter((ref) => ref.type === "page");
  const primaryPageId = pageRefs.find((ref) => ref.role === "primary")?.id ?? null;

  return runAiChatTurn({
    abortSignal: c.req.raw.signal,
    env: c.env,
    messages,
    requestBody: {
      allowedPageIds: pageRefs.map((ref) => ref.id),
      attachmentIds: body.data.attachmentIds,
      clientTurnId: body.data.clientTurnId,
      contextRefs: body.data.contextRefs,
      mentionedUserIds: body.data.mentionedUserIds,
      model: body.data.modelId,
      pageContext: null,
      primaryPageId,
      threadId,
      userClientMessageId: body.data.clientMessageId,
      userId: auth.user.id,
      userMessageId: userMessage.id,
      workspaceId: auth.workspaceId,
    },
    withDb: (fn) => runWithDbEnv(c.env, fn),
  });
});

aiRoutes.get("/threads/:threadId/actions/:actionId", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;

  const threadId = c.req.param("threadId");
  const actionId = c.req.param("actionId");
  const action = await getOwnedPendingAgentAction({
    actionId,
    threadId,
    userId: auth.user.id,
    workspaceId: auth.workspaceId,
  });
  if (!action) return c.json({ error: "Review request not found" }, 404);

  if (action.status === "pending" && action.expiresAt.getTime() <= Date.now()) {
    await expirePendingAgentAction(action.id);
    return c.json({ actionId, error: null, status: "expired" });
  }

  return c.json({
    actionId,
    error: action.error,
    status: action.status,
  });
});

aiRoutes.post("/threads/:threadId/actions/:actionId/approve", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;

  const threadId = c.req.param("threadId");
  const actionId = c.req.param("actionId");
  const action = await getOwnedPendingAgentAction({
    actionId,
    threadId,
    userId: auth.user.id,
    workspaceId: auth.workspaceId,
  });
  if (!action) return c.json({ error: "Review request not found" }, 404);
  if (action.status === "succeeded") {
    return c.json({ actionId, result: action.result, status: action.status });
  }
  if (action.status !== "pending") {
    return c.json({
      error: `Review request is ${action.status}`,
      status: action.status,
    }, 409);
  }
  if (action.expiresAt.getTime() <= Date.now()) {
    await expirePendingAgentAction(action.id);
    return c.json({ error: "Review request expired", status: "expired" }, 410);
  }
  const descriptor = getAgentToolDescriptor(action.toolName);
  if (
    !descriptor ||
    descriptor.risk !== "review" ||
    descriptor.version !== action.toolVersion ||
    await hashAgentToolInput(action.toolInput) !== action.inputHash
  ) {
    return c.json({ error: "Review request no longer matches the executable tool" }, 409);
  }

  const executing = await markPendingAgentActionExecuting({
    actionId,
    threadId,
    userId: auth.user.id,
    workspaceId: auth.workspaceId,
  });
  if (!executing) {
    return c.json({ error: "Review request was already handled" }, 409);
  }

  try {
    const tools = buildRegisteredAgentTools({
      editablePageIds: [],
      env: c.env,
      primaryPageId: null,
      threadId,
      userId: auth.user.id,
      workspaceId: auth.workspaceId,
      withDb: (fn) => runWithDbEnv(c.env, fn),
    }, { bypassApprovals: true });
    const registeredTool = tools[action.toolName] as {
      execute?: (input: unknown, options: {
        abortSignal: AbortSignal;
        messages: never[];
        toolCallId: string;
      }) => Promise<unknown> | unknown;
    } | undefined;
    if (!registeredTool?.execute) {
      throw new Error("Approved tool is no longer executable.");
    }
    const result = await registeredTool.execute(action.toolInput, {
      abortSignal: c.req.raw.signal,
      messages: [],
      toolCallId: `approved:${action.id}`,
    });
    await finishPendingAgentAction({ actionId, result });
    return c.json({ actionId, result, status: "succeeded" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approved action failed";
    await finishPendingAgentAction({ actionId, error: message });
    return c.json({ error: message, status: "failed" }, 409);
  }
});

aiRoutes.post("/threads/:threadId/actions/:actionId/reject", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;
  const rejected = await rejectPendingAgentAction({
    actionId: c.req.param("actionId"),
    threadId: c.req.param("threadId"),
    userId: auth.user.id,
    workspaceId: auth.workspaceId,
  });
  if (!rejected) return c.json({ error: "Review request is unavailable" }, 409);
  return c.json({ actionId: rejected.id, status: "rejected" });
});

aiRoutes.post("/editor", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await parseJson(c, editorAiRequestSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    const skillContext = body.data.skillPageId
      ? await resolveEditorSkillContext(
          body.data.skillPageId,
          auth.workspaceId,
          auth.user.id,
        )
      : null;

    if (skillContext && "response" in skillContext) {
      return skillContext.response;
    }

    const model = await resolveWorkspaceAiModel(
      auth.workspaceId,
      body.data.model,
      c.env,
      "editor",
    );
    const result = streamText({
      abortSignal: c.req.raw.signal,
      experimental_transform: smoothStream({ chunking: "word", delayInMs: 16 }),
      maxOutputTokens: 1800,
      model: model.model,
      prompt: buildEditorPrompt({
        prompt: body.data.prompt,
        selectedText: body.data.selectedText,
        skill: skillContext?.skill ?? null,
      }),
      system: [
        "You write directly into a Zilobase rich-text editor.",
        "When selected text is provided, replace that selection according to the user's request instead of answering conversationally.",
        "For selected prose, return prose. Do not turn selected prose into a code block.",
        "When a skill is provided, follow it as reusable writing or transformation guidance for this request.",
        "Return only Markdown content that should be inserted into the page.",
        "Do not wrap the whole answer in a fenced code block unless the user explicitly asks for code.",
        "Do not use Markdown footnote syntax like [^1] or [^1]:. If a note is needed, use a normal Notes heading and a numbered list.",
        "Use headings, lists, tables, blockquotes, and inline formatting when they make the result easier to scan.",
        "Do not include prefaces such as 'Here is' or mention that you are an AI.",
      ].join("\n"),
      temperature: 0.45,
      onError: ({ error }) => {
        console.warn("Editor AI stream provider error", toProviderErrorMessage(error));
      },
    });

    return createPlainTextStreamResponse(result.textStream);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 408 });
    }

    if (error instanceof AiProviderConfigError) {
      return Response.json(
        { error: error.message, message: error.message },
        { status: error.status },
      );
    }

    console.error("Editor AI generation failed", error);

    return c.json({ error: "Failed to generate editor content" }, 500);
  }
});

type EditorSkillContext = {
  content: string;
  name: string;
};

async function resolveEditorSkillContext(
  skillPageId: string,
  workspaceId: string,
  userId: string,
): Promise<
  | { skill: EditorSkillContext }
  | { response: Response }
> {
  const skill = await getPageRecord(skillPageId);

  if (!skill || skill.workspaceId !== workspaceId) {
    return {
      response: Response.json(
        { error: "Skill not found", message: "Skill not found" },
        { status: 404 },
      ),
    };
  }

  if (!(await canAccessPage(skill.id, userId, "view"))) {
    return {
      response: Response.json(
        { error: "Forbidden", message: "Forbidden" },
        { status: 403 },
      ),
    };
  }

  if (readZilobaseAiMode(skill.metadata) !== "skill") {
    return {
      response: Response.json(
        {
          error: "Page is not an AI skill",
          message: "Page is not an AI skill",
        },
        { status: 400 },
      ),
    };
  }

  return {
    skill: {
      content: prosemirrorToPlainText(skill.content).slice(0, 12000),
      name: skill.name || "Untitled skill",
    },
  };
}

function buildEditorPrompt({
  prompt,
  selectedText,
  skill,
}: {
  prompt: string;
  selectedText?: string;
  skill: EditorSkillContext | null;
}) {
  const parts: string[] = [];

  if (skill?.content.trim()) {
    parts.push(
      [
        `Skill: ${skill.name}`,
        "Use this skill content as guidance:",
        skill.content.trim(),
      ].join("\n"),
    );
  }

  if (selectedText?.trim()) {
    parts.push(
      [
        "Selected text to replace is between <selected_text> tags. Do not include the tags in your response.",
        "<selected_text>",
        selectedText.trim(),
        "</selected_text>",
      ].join("\n"),
    );
  }

  parts.push(["User request:", prompt.trim()].join("\n"));

  return parts.join("\n\n");
}

function createPlainTextStreamResponse(textStream: AsyncIterable<string>) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of textStream) {
            if (!chunk) {
              continue;
            }

            controller.enqueue(encoder.encode(chunk));
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    }),
    {
      headers: {
        "cache-control": "no-cache, no-transform",
        "content-encoding": "identity",
        "content-type": "text/plain; charset=utf-8",
        "x-accel-buffering": "no",
      },
    },
  );
}

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

  if (!(await getMembership(workspaceId, user.id))) {
    return { response: c.json({ error: "Forbidden" }, 403) };
  }

  return { workspaceId, user };
}

function readZilobaseAiMode(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const mode = (metadata as { zilobaseai?: unknown }).zilobaseai;

  return mode === "instruction" || mode === "skill" ? mode : null;
}

type ProseMirrorNode = {
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type?: string;
};

function prosemirrorToPlainText(content: unknown): string {
  if (content === null || content === undefined) {
    return "";
  }

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => prosemirrorToPlainText(item))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  if (typeof content !== "object") {
    return "";
  }

  const node = content as ProseMirrorNode;

  if (node.type === "doc") {
    return serializeSkillBlocks(node.content ?? []);
  }

  return serializeSkillBlocks([node]).trim();
}

function serializeSkillBlocks(nodes: ProseMirrorNode[]) {
  return nodes
    .map(serializeSkillBlock)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function serializeSkillBlock(node: ProseMirrorNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "heading") {
    const level =
      typeof node.attrs?.level === "number"
        ? Math.min(Math.max(node.attrs.level, 1), 6)
        : 1;
    return `${"#".repeat(level)} ${serializeSkillInline(node.content ?? [])}`.trim();
  }

  if (
    node.type === "bulletList" ||
    node.type === "orderedList" ||
    node.type === "taskList"
  ) {
    return serializeSkillList(node);
  }

  if (node.type === "codeBlock") {
    const language =
      typeof node.attrs?.language === "string" ? node.attrs.language : "";
    return `\`\`\`${language}\n${serializeSkillInline(node.content ?? [])}\n\`\`\``;
  }

  if (node.type === "blockquote") {
    return serializeSkillBlocks(node.content ?? [])
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  if (node.type === "paragraph") {
    return serializeSkillInline(node.content ?? []);
  }

  return node.content?.length ? serializeSkillBlocks(node.content) : "";
}

function serializeSkillList(node: ProseMirrorNode) {
  return (node.content ?? [])
    .map((child, index) => {
      const marker =
        node.type === "orderedList"
          ? `${index + 1}. `
          : node.type === "taskList"
            ? `- [${child.attrs?.checked === true ? "x" : " "}] `
            : "- ";
      return `${marker}${serializeSkillBlocks(child.content ?? [])}`;
    })
    .join("\n");
}

function serializeSkillInline(nodes: ProseMirrorNode[]) {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") {
        return "\n";
      }

      if (node.type === "text") {
        return applySkillMarks(node.text ?? "", node.marks ?? []);
      }

      return serializeSkillBlock(node);
    })
    .join("");
}

function applySkillMarks(
  text: string,
  marks: Array<{ attrs?: Record<string, unknown>; type: string }>,
) {
  return marks.reduce((current, mark) => {
    if (mark.type === "bold" || mark.type === "strong") {
      return `**${current}**`;
    }

    if (mark.type === "italic" || mark.type === "em") {
      return `*${current}*`;
    }

    if (mark.type === "strike") {
      return `~~${current}~~`;
    }

    if (mark.type === "code") {
      return `\`${current}\``;
    }

    if (mark.type === "link" && typeof mark.attrs?.href === "string") {
      return `[${current}](${mark.attrs.href})`;
    }

    return current;
  }, text);
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

async function readJsonBody(c: Context<AppBindings>) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function readObject(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function toProviderErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "The AI provider failed while processing this request.";
}
