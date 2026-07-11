import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import * as z from "zod";

import { AiProviderConfigError, resolveWorkspaceAiModel } from "../../ai/ai-provider";
import { buildGithubTools } from "../../ai/ask-ai-github-tools";
import { buildGmailTools } from "../../ai/ask-ai-gmail-tools";
import { buildGoogleCalendarTools } from "../../ai/ask-ai-google-calendar-tools";
import { buildGoogleDriveTools } from "../../ai/ask-ai-google-drive-tools";
import { buildLinearTools } from "../../ai/ask-ai-linear-tools";
import { buildSlackTools } from "../../ai/ask-ai-slack-tools";
import { canAccessPage, getMembership, getPageRecord } from "../../access";
import { createDbClient, db, runWithDbClient } from "../../db";
import { workspaceIntegration, userIntegration } from "../../db/schema";
import type { AppBindings } from "../../types";
import {
  coerceAiChatRequestBody,
  runAiChatTurn,
} from "../../ai/chat-service";

type SourceId =
  | "gmail"
  | "github"
  | "google-calendar"
  | "google-drive"
  | "slack"
  | "linear";

type CalendarAccess = {
  accessToken: string;
  coworkerCalendarAccessEnabled: boolean;
};

const askAiRequestSchema = z
  .object({
    apiKey: z.string().trim().optional(),
    messages: z.array(z.unknown()).default([]),
    model: z.string().trim().optional(),
    prompt: z.string().trim().optional(),
    sources: z
      .array(
        z.enum([
          "gmail",
          "github",
          "google-calendar",
          "google-drive",
          "slack",
          "linear",
        ]),
      )
      .default([])
      .transform((sources) => Array.from(new Set(sources))),
  })
  .refine((value) => value.prompt || value.messages.length > 0, {
    message: "Either prompt or messages is required",
  });

const editorAiRequestSchema = z.object({
  model: z.string().trim().optional(),
  prompt: z.string().trim().min(1),
  selectedText: z.string().trim().max(20000).optional(),
  skillPageId: z.string().trim().min(1).optional(),
});

export const aiRoutes = new Hono<AppBindings>();

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
    withDb: (fn) => runWithDbClient(createDbClient(c.env), fn),
  });
});

aiRoutes.post("/ask", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await parseJson(c, askAiRequestSchema);

  if (!body.success) {
    return body.response;
  }

  const connections = await getIntegrationConnections(auth.workspaceId, auth.user.id);

  if (
    !connections.gmail &&
    !connections.github &&
    !connections.googleCalendar &&
    !connections.googleDrive &&
    !connections.slack &&
    !connections.linear
  ) {
    return c.json(
      {
        code: "ASK_AI_INTEGRATION_NOT_CONNECTED",
        message:
          "Connect Gmail, GitHub, Google Calendar, Google Drive, Slack, or Linear before asking page integration questions.",
      },
      409,
    );
  }

  const messages = await toModelMessages(body.data.messages, body.data.prompt);

  if (!messages.success) {
    return messages.response;
  }

  const sourceFilter = new Set(body.data.sources);
  const shouldUseSource = (source: SourceId) =>
    sourceFilter.size === 0 || sourceFilter.has(source);

  const tools: ToolSet = {
    ...(connections.gmail && shouldUseSource("gmail")
      ? buildGmailTools(connections.gmail)
      : {}),
    ...(connections.github && shouldUseSource("github")
      ? buildGithubTools(connections.github)
      : {}),
    ...(connections.googleCalendar && shouldUseSource("google-calendar")
      ? buildGoogleCalendarTools(connections.googleCalendar)
      : {}),
    ...(connections.googleDrive && shouldUseSource("google-drive")
      ? buildGoogleDriveTools(connections.googleDrive)
      : {}),
    ...(connections.slack && shouldUseSource("slack")
      ? buildSlackTools(connections.slack)
      : {}),
    ...(connections.linear && shouldUseSource("linear")
      ? buildLinearTools(connections.linear)
      : {}),
  };

  if (Object.keys(tools).length === 0) {
    return c.json(
      {
        code: "ASK_AI_SELECTED_SOURCES_NOT_CONNECTED",
        message:
          "The selected sources are not connected. Add a connected source or remove the source filter.",
      },
      409,
    );
  }

  try {
    const model = await resolveWorkspaceAiModel(
      auth.workspaceId,
      body.data.model,
      c.env.OPENAI_API_KEY,
    );
    const result = streamText({
      abortSignal: c.req.raw.signal,
      maxOutputTokens: 1600,
      messages: messages.data,
      model,
      stopWhen: stepCountIs(5),
      system: [
        "You are Notelab's page research assistant.",
        "Use Gmail tools when the user asks about email, inbox, people, timelines, project updates, decisions, blockers, or messages from email.",
        "Use GitHub tools when the user asks about repositories, issues, pull requests, commits, branches, files, code, releases, bugs, reviews, or work tracked in GitHub.",
        "Use Google Calendar tools when the user asks about meetings, schedules, events, availability, free/busy windows, calendars, attendees, or time-based planning.",
        "Use Google Drive tools when the user asks about Drive files, Docs, Sheets, Slides, documents, folders, file owners, recently changed files, or content stored in Google Drive.",
        "Use Slack tools for workspace Slack context only: channels, private channels the Notelab app can access, threads, canvases, files, project chatter, decisions, blockers, and page messages.",
        "Use Linear tools when the user asks about issues, tickets, bugs, tasks, projects, teams, cycles, status, assignees, priorities, blockers, scope, delivery progress, or roadmap work tracked in Linear.",
        body.data.sources.length
          ? `Only use these selected sources for this request: ${body.data.sources.join(", ")}. Do not use tools from unselected sources.`
          : "If the user has not selected sources for this request, choose among all connected Gmail, GitHub, Google Calendar, Google Drive, Slack, and Linear tools as needed.",
        "The connected workspace tools are read-only. Never claim you sent, modified, archived, labeled, deleted, drafted, posted, updated, assigned, commented on, scheduled, canceled, merged, closed, reopened, reviewed, uploaded, moved, shared, or marked any Gmail, GitHub, Google Calendar, Google Drive, Slack, or Linear item.",
        "Prefer concise answers with dates, participants, links, and message subjects when useful.",
        "If the available integration results are insufficient, say what is missing and suggest a narrower query.",
      ].join("\n"),
      temperature: 0.2,
      tools,
      onError: ({ error }) => {
        console.warn("Ask AI stream provider error", toProviderErrorMessage(error));
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => toProviderErrorMessage(error),
    });
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

    console.error("Ask AI integration request failed", error);

    return c.json({ error: "Failed to process integration AI request" }, 500);
  }
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
        "You write directly into a Notelab rich-text editor.",
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

  if (readNotelabAiMode(skill.metadata) !== "skill") {
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

function readNotelabAiMode(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const mode = (metadata as { notelabai?: unknown }).notelabai;

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

async function getIntegrationConnections(workspaceId: string, userId: string) {
  const rows = await db
    .select()
    .from(workspaceIntegration)
    .where(
      and(
        eq(workspaceIntegration.workspaceId, workspaceId),
        eq(workspaceIntegration.status, "connected"),
      ),
    );
  const byKey = new Map(rows.map((row) => [row.integrationKey, row]));
  const googleCalendar = byKey.get("google-calendar");
  const personalRows = await db
    .select()
    .from(userIntegration)
    .where(
      and(
        eq(userIntegration.workspaceId, workspaceId),
        eq(userIntegration.userId, userId),
        eq(userIntegration.status, "connected"),
      ),
    );
  const personalByKey = new Map(
    personalRows.map((row) => [row.integrationKey, row]),
  );

  return {
    gmail: personalByKey.get("gmail")?.accessToken,
    github: personalByKey.get("github")?.accessToken,
    googleCalendar: personalByKey.get("google-calendar")
      ? ({
          accessToken: personalByKey.get("google-calendar")!.accessToken,
          coworkerCalendarAccessEnabled: Boolean(
            readObject(googleCalendar?.metadata).coworkerCalendarAccessEnabled,
          ),
        } satisfies CalendarAccess)
      : undefined,
    googleDrive: personalByKey.get("google-drive")?.accessToken,
    linear: personalByKey.get("linear")?.accessToken,
    slack: byKey.get("slack")?.accessToken,
  };
}

async function toModelMessages(rawMessages: unknown[], prompt?: string): Promise<
  | { success: true; data: ModelMessage[] }
  | { success: false; response: Response }
> {
  if (rawMessages.length === 0 && prompt) {
    return {
      success: true,
      data: [{ content: prompt, role: "user" }],
    };
  }

  try {
    return {
      success: true,
      data: await convertToModelMessages(rawMessages as UIMessage[]),
    };
  } catch {
    return {
      success: false,
      response: Response.json(
        { code: "VALIDATION_ERROR", message: "Invalid AI messages" },
        { status: 400 },
      ),
    };
  }
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
