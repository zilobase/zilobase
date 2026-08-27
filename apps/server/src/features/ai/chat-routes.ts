import { smoothStream, streamText, type UIMessage } from "ai";
import { Hono } from "hono";
import type { Context } from "hono";
import * as z from "zod";

import { AiProviderConfigError, resolveWorkspaceAiModel } from "../../ai/ai-provider";
import { canAccessPage, getMembership, getPageRecord } from "../../access";
import { db, runWithDbEnv } from "../../db";
import type { AppBindings } from "../../types";
import {
  coerceAiChatRequestBody,
  runAiChatTurn,
} from "../../ai/chat-service";
import { aiFileRoutes } from "./file-routes";

const editorAiRequestSchema = z.object({
  model: z.string().trim().optional(),
  prompt: z.string().trim().min(1),
  selectedText: z.string().trim().max(20000).optional(),
  skillPageId: z.string().trim().min(1).optional(),
});

export const aiRoutes = new Hono<AppBindings>();

aiRoutes.route("/", aiFileRoutes);

aiRoutes.post("/chat", async (c) => {
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
      c.env.OPENAI_API_KEY,
    );
    const result = streamText({
      abortSignal: c.req.raw.signal,
      experimental_transform: smoothStream({ chunking: "word", delayInMs: 16 }),
      maxOutputTokens: 1800,
      model,
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
