import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { and, eq } from "drizzle-orm";

import { getMembership } from "../access";
import { db as dbProxy } from "../db";
import { workspaceIntegration, userIntegration } from "../db/schema";
import type { AppBindings } from "../types";
import { buildGithubTools } from "./ask-ai-github-tools";
import { buildGmailTools } from "./ask-ai-gmail-tools";
import { buildGoogleCalendarTools } from "./ask-ai-google-calendar-tools";
import { buildGoogleDriveTools } from "./ask-ai-google-drive-tools";
import { buildLinearTools } from "./ask-ai-linear-tools";
import { buildSlackTools } from "./ask-ai-slack-tools";
import {
  buildDatabaseConfigInstruction,
  buildDatabaseConfigTools,
} from "./ask-ai-database-tools";
import { buildPageEditTools } from "./ask-ai-page-tools";
import { resolveOpenAiChatModel } from "./ai-provider";
import {
  getAiChatThreadForUser,
  maybeAutoTitleAiChatThread,
  syncAiChatThreadMessages,
  touchAiChatThreadActivity,
} from "./chat-persistence";

export type SourceId =
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

type IntegrationConnections = {
  gmail?: string;
  github?: string;
  googleCalendar?: CalendarAccess;
  googleDrive?: string;
  linear?: string;
  slack?: string;
};

export type AiChatRequestBody = {
  allowedPageIds: string[];
  canEditPages: boolean;
  model: string | undefined;
  workspaceId: string | null;
  primaryPageId: string | null;
  threadId: string | null;
  userId: string | null;
  sources: SourceId[];
  pageContext: string | null;
};

const MAX_WORKSPACE_CONTEXT_CHARS = 32_000;

const REQUESTABLE_SOURCES: SourceId[] = [
  "gmail",
  "github",
  "google-calendar",
  "google-drive",
  "slack",
  "linear",
];

const SYSTEM_PROMPT =
  "You are Notelab's page research assistant. When Notelab page context is provided, treat it as the authoritative source for questions about the current page, attached pages, embedded databases, properties, and rows shown in that context."
  + " Use Gmail tools when the user asks about email, inbox, people, timelines, project updates, decisions, blockers, or messages from email. Use GitHub tools when the user asks about repositories, issues, pull requests, commits, files, code, releases, bugs, reviews, or work tracked in GitHub. Use Google Calendar tools when the user asks about meetings, schedules, events, availability, free/busy windows, calendars, attendees, or time-based planning. Use Google Drive tools when the user asks about Drive files, Docs, Sheets, Slides, documents, folders, file owners, recently changed files, or content stored in Google Drive. Use Slack tools for workspace Slack context only: channels, private channels the Notelab app can access, threads, canvases, files, project chatter, decisions, blockers, and page messages. Use Linear tools when the user asks about issues, tickets, bugs, tasks, projects, teams, cycles, status, assignees, priorities, blockers, scope, delivery progress, or roadmap work tracked in Linear."
  + " The connected Gmail, GitHub, Google Calendar, Google Drive, Slack, and Linear tools are read-only. Never claim you sent, modified, archived, labeled, deleted, drafted, posted, updated, assigned, commented on, scheduled, canceled, merged, closed, reopened, reviewed, uploaded, moved, shared, or marked any connected external item."
  + " Notelab database and page configuration tools may create and update Notelab pages, databases, properties, rows, views, and embeds when the user asks."
  + " Prefer concise answers with dates, participants, links, and message subjects when useful. If available integration results are insufficient, say what is missing and suggest a narrower query.";

export async function runAiChatTurn(input: {
  abortSignal?: AbortSignal;
  env: AppBindings["Bindings"] & Record<string, unknown>;
  messages: UIMessage[];
  onStreamFinish?: StreamTextOnFinishCallback<ToolSet>;
  persistOnFinish?: boolean;
  requestBody: AiChatRequestBody;
  withDb<T>(fn: () => Promise<T>): Promise<T>;
}) {
  const { requestBody } = input;
  const workspaceId = requestBody.workspaceId;
  const userId = requestBody.userId;
  const threadId = requestBody.threadId;

  if (!workspaceId) {
    return Response.json(
      { error: "Missing workspaceId in request body." },
      { status: 409 },
    );
  }

  if (!userId) {
    return Response.json(
      { error: "Missing userId in request body." },
      { status: 409 },
    );
  }

  if (!threadId) {
    return Response.json(
      { error: "Missing threadId in request body." },
      { status: 409 },
    );
  }

  const auth = await input.withDb(async () => {
    if (!(await getMembership(workspaceId, userId))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const thread = await getAiChatThreadForUser({
      workspaceId,
      threadId,
      userId,
    });

    if (!thread) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    const connections = await getIntegrationConnections(workspaceId, userId);

    return {
      connections,
      threadId: thread.id,
      userId,
    };
  });

  if (auth instanceof Response) {
    return auth;
  }

  const selectedSources = new Set(requestBody.sources);
  const shouldUseSource = (source: SourceId) =>
    selectedSources.size === 0 || selectedSources.has(source);

  const hasPageContext = Boolean(requestBody.pageContext);
  const allowedPageIds = requestBody.allowedPageIds;
  const hasPageEditAccess = hasPageContext && requestBody.canEditPages;

  if (hasPageContext) {
    console.warn(
      `AI chat page edit: canEdit=${requestBody.canEditPages} allowedIds=${allowedPageIds.join(",") || "(none)"} primaryId=${requestBody.primaryPageId ?? "(none)"}`,
    );
  }

  const tools: ToolSet = {
    ...(hasPageEditAccess
      ? {
          ...buildPageEditTools(allowedPageIds),
          ...buildDatabaseConfigTools({
            allowedPageIds: new Set(allowedPageIds),
            env: input.env,
            workspaceId,
            primaryPageId: requestBody.primaryPageId,
            userId: auth.userId,
            withDb: (fn) => input.withDb(fn),
          }),
        }
      : {}),
    ...(auth.connections.gmail && shouldUseSource("gmail")
      ? buildGmailTools(auth.connections.gmail)
      : {}),
    ...(auth.connections.github && shouldUseSource("github")
      ? buildGithubTools(auth.connections.github)
      : {}),
    ...(auth.connections.googleCalendar && shouldUseSource("google-calendar")
      ? buildGoogleCalendarTools(auth.connections.googleCalendar)
      : {}),
    ...(auth.connections.googleDrive && shouldUseSource("google-drive")
      ? buildGoogleDriveTools(auth.connections.googleDrive)
      : {}),
    ...(auth.connections.slack && shouldUseSource("slack")
      ? buildSlackTools(auth.connections.slack)
      : {}),
    ...(auth.connections.linear && shouldUseSource("linear")
      ? buildLinearTools(auth.connections.linear)
      : {}),
  };

  const model = resolveOpenAiChatModel(input.env.OPENAI_API_KEY, requestBody.model);
  const chatMessages = input.messages.filter(
    (message) => (message.role as string) !== "data",
  );
  const persistedMessages = await convertToModelMessages(chatMessages);
  const hasTools = Object.keys(tools).length > 0;
  const pageContextInstruction = buildPageContextInstruction(
    requestBody.pageContext,
  );
  const pageEditInstruction = hasPageEditAccess
    ? [
        buildPageEditInstruction({
          allowedPageIds,
          primaryPageId: requestBody.primaryPageId,
        }),
        buildDatabaseConfigInstruction({
          allowedPageIds,
          primaryPageId: requestBody.primaryPageId,
        }),
      ].join("")
    : "";
  const sourceInstruction = buildSourceInstruction({
    hasTools,
    hasPageContext,
    sources: requestBody.sources,
  });

  const result = streamText({
    abortSignal: input.abortSignal,
    maxOutputTokens: 1600,
    model,
    messages: persistedMessages,
    stopWhen: stepCountIs(15),
    tools: hasTools ? tools : undefined,
    temperature: 0.2,
    system: `${SYSTEM_PROMPT}${pageEditInstruction}${pageContextInstruction} ${sourceInstruction}`,
    onError: ({ error }) => {
      console.warn(`AI chat ${auth.userId}: ${toProviderErrorMessage(error)}`);
    },
    onFinish: input.onStreamFinish,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: input.messages,
    onError: (error) => toProviderErrorMessage(error),
    onFinish: input.persistOnFinish === false
      ? undefined
      : async ({ messages, isAborted }) => {
          if (isAborted) {
            return;
          }

          await input.withDb(async () => {
            await syncAiChatThreadMessages(auth.threadId, messages);
            await touchAiChatThreadActivity(auth.threadId);
            await maybeAutoTitleAiChatThread(auth.threadId, messages);
          });
        },
  });
}

export function coerceAiChatRequestBody(body: unknown): AiChatRequestBody {
  if (!body || typeof body !== "object") {
    return {
      allowedPageIds: [],
      canEditPages: false,
      primaryPageId: null,
      model: undefined,
      workspaceId: null,
      threadId: null,
      userId: null,
      sources: [],
      pageContext: null,
    };
  }

  const raw = body as Record<string, unknown>;
  const rawModel = typeof raw.model === "string" && raw.model.trim()
    ? raw.model.trim()
    : undefined;
  const rawWorkspaceId =
    typeof raw.workspaceId === "string" ? raw.workspaceId.trim() : "";
  const rawThreadId =
    typeof raw.threadId === "string" ? raw.threadId.trim() : "";
  const rawUserId =
    typeof raw.userId === "string" ? raw.userId.trim() : "";
  const sources = Array.isArray(raw.sources)
    ? raw.sources
        .filter((source): source is string => typeof source === "string")
        .map((source) => source.trim())
        .filter((source): source is SourceId =>
          REQUESTABLE_SOURCES.includes(source as SourceId),
        )
    : [];

  const pageContextMeta = readPageContextMeta(raw);

  return {
    allowedPageIds: readAllowedPageIds(raw, pageContextMeta),
    canEditPages: raw.canEditPages === true,
    model: rawModel,
    primaryPageId: pageContextMeta.primaryId,
    workspaceId: rawWorkspaceId.length > 0 ? rawWorkspaceId : null,
    threadId: rawThreadId.length > 0 ? rawThreadId : null,
    userId: rawUserId.length > 0 ? rawUserId : null,
    sources,
    pageContext: readPageContext(raw),
  };
}

function buildPageEditInstruction(input: {
  allowedPageIds: string[];
  primaryPageId: string | null;
}) {
  if (input.allowedPageIds.length === 0) {
    return "";
  }

  const primaryHint = input.primaryPageId
    ? ` Default to the primary pageId ${input.primaryPageId} unless the user names another attached page.`
    : "";

  return [
    "",
    "## Page page edits",
    "When the user asks to change page content, call proposePageContentUpdate.",
    "Use the exact Page ID from the page context as pageId.",
    `Allowed pageIds: ${input.allowedPageIds.join(", ")}.`,
    primaryHint,
    "Default to editMode patch for intro/section/paragraph edits: copy the exact existing section into searchText and put only the updated section in replaceText.",
    "Preserve embeds, links, databases, and all unrelated content. Never return only the changed section as the whole page.",
    "Use editMode full only when the user explicitly asks to rewrite the entire page.",
    "After the tool succeeds, briefly confirm what changed. Do not say the page is outside context when its Page ID is listed above.",
  ].join(" ");
}

function buildPageContextInstruction(pageContext: string | null) {
  if (!pageContext) {
    return "";
  }

  return [
    "",
    "## Notelab page context",
    "The following markdown describes the current Notelab page and any attached pages or databases.",
    "Answer questions about this page, page content, databases, properties, and rows using this context first.",
    "Do not say you lack access to the page when this context is present.",
    "",
    pageContext,
  ].join("\n");
}

function buildSourceInstruction(input: {
  hasTools: boolean;
  hasPageContext: boolean;
  sources: SourceId[];
}) {
  if (input.hasTools) {
    return input.sources.length > 0
      ? `Only use these selected sources for this request: ${input.sources.join(", ")}.`
      : "Use all connected integration sources when the user asks about external tools.";
  }

  if (input.hasPageContext) {
    return "No external integration sources are connected. Answer page questions from the Notelab page context above.";
  }

  return "No page integration sources are connected. Answer from general knowledge and ask the user to connect Gmail, GitHub, Google Calendar, Google Drive, Slack, or Linear for page-specific data.";
}

function readPageContext(body: Record<string, unknown>) {
  const rawValue = body.pageContext;

  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= MAX_WORKSPACE_CONTEXT_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_WORKSPACE_CONTEXT_CHARS)}\n\n[Page context truncated]`;
}

function readPageContextMeta(body: Record<string, unknown>) {
  const rawMeta = body.pageContextMeta;

  if (!rawMeta || typeof rawMeta !== "object") {
    return {
      attachmentIds: [] as string[],
      primaryId: null as string | null,
    };
  }

  const meta = rawMeta as Record<string, unknown>;
  const primaryId =
    typeof meta.primaryId === "string" && meta.primaryId.trim()
      ? meta.primaryId.trim()
      : null;
  const attachmentIds = Array.isArray(meta.attachmentIds)
    ? meta.attachmentIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return { attachmentIds, primaryId };
}

function readAllowedPageIds(
  body: Record<string, unknown>,
  pageContextMeta: { attachmentIds: string[]; primaryId: string | null },
) {
  const fromBody = Array.isArray(body.allowedPageIds)
    ? body.allowedPageIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  if (fromBody.length > 0) {
    return [...new Set(fromBody)];
  }

  const ids = new Set<string>();

  if (pageContextMeta.primaryId) {
    ids.add(pageContextMeta.primaryId);
  }

  for (const attachmentId of pageContextMeta.attachmentIds) {
    ids.add(attachmentId);
  }

  return [...ids];
}

async function getIntegrationConnections(
  workspaceId: string,
  userId: string,
) {
  const rows = await dbProxy
    .select()
    .from(workspaceIntegration)
    .where(
      and(
        eq(workspaceIntegration.workspaceId, workspaceId),
        eq(workspaceIntegration.status, "connected"),
      ),
    );
  const byKey = new Map(rows.map((row) => [row.integrationKey, row]));
  const personalRows = await dbProxy
    .select()
    .from(userIntegration)
    .where(
      and(
        eq(userIntegration.workspaceId, workspaceId),
        eq(userIntegration.userId, userId),
        eq(userIntegration.status, "connected"),
      ),
    );

  const personalByKey = new Map(personalRows.map((row) => [row.integrationKey, row]));

  return {
    gmail: personalByKey.get("gmail")?.accessToken,
    github: personalByKey.get("github")?.accessToken,
    googleCalendar: personalByKey.get("google-calendar")
      ? ({
          accessToken: personalByKey.get("google-calendar")!.accessToken,
          coworkerCalendarAccessEnabled: Boolean(
            readObject(personalByKey.get("google-calendar")?.metadata)
              .coworkerCalendarAccessEnabled,
          ),
        } satisfies CalendarAccess)
      : undefined,
    googleDrive: personalByKey.get("google-drive")?.accessToken,
    linear: personalByKey.get("linear")?.accessToken,
    slack: byKey.get("slack")?.accessToken,
  } satisfies IntegrationConnections;
}

function readObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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
