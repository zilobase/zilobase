import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { canAccessPageInWorkspace, getMembership } from "../access";
import type { AppBindings } from "../types";
import { getRuntimeAdapter } from "../runtime-adapter";
import {
  buildDatabaseConfigInstruction,
  buildDatabaseConfigTools,
} from "./ask-ai-database-tools";
import { buildPageEditTools } from "./ask-ai-page-tools";
import { buildWorkspaceReadTools } from "./ask-ai-workspace-tools";
import { resolveOpenAiChatModel } from "./ai-provider";
import {
  buildAgentPolicyInstruction,
  resolveAgentCapabilityPolicy,
} from "./agent-capabilities";
import {
  buildToolkitTools,
  isToolkitConfigured,
} from "../integrations/toolkit";
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
  "You are Zilobase's workspace agent. Complete bounded multi-step research and supported actions using tools, and clearly report partial failures. When Zilobase page context is provided, treat it as the authoritative source for questions about the current page, attached pages, embedded databases, properties, and rows shown in that context. Use searchWorkspace for workspace-wide discovery, readWorkspacePage for a page's stored body, readPageComments only when comments matter, and queryWorkspaceDatabase for current structured rows and properties. Use citation URLs returned by tools when attributing workspace facts."
  + " Use Gmail tools when the user asks about email, inbox, people, timelines, project updates, decisions, blockers, or messages from email. Use GitHub tools when the user asks about repositories, issues, pull requests, commits, files, code, releases, bugs, reviews, or work tracked in GitHub. Use Google Calendar tools when the user asks about meetings, schedules, events, availability, free/busy windows, calendars, attendees, or time-based planning. Use Google Drive tools when the user asks about Drive files, Docs, Sheets, Slides, documents, folders, file owners, recently changed files, or content stored in Google Drive. Use Slack tools for workspace Slack context only: channels, private channels the Zilobase app can access, threads, canvases, files, project chatter, decisions, blockers, and page messages. Use Linear tools when the user asks about issues, tickets, bugs, tasks, projects, teams, cycles, status, assignees, priorities, blockers, scope, delivery progress, or roadmap work tracked in Linear."
  + " The connected Gmail, GitHub, Google Calendar, Google Drive, Slack, and Linear tools are read-only. Never claim you sent, modified, archived, labeled, deleted, drafted, posted, updated, assigned, commented on, scheduled, canceled, merged, closed, reopened, reviewed, uploaded, moved, shared, or marked any connected external item."
  + " Zilobase database and page configuration tools may create and update Zilobase pages, databases, properties, rows, views, and embeds when the user asks."
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

    return {
      threadId: thread.id,
      userId,
    };
  });

  if (auth instanceof Response) {
    return auth;
  }

  const hasPageContext = Boolean(requestBody.pageContext);
  const referencedPageAccess = await input.withDb(() =>
    resolveReferencedPageAccess({
      pageIds: requestBody.allowedPageIds,
      userId: auth.userId,
      workspaceId,
    }),
  );
  const readablePageIds = referencedPageAccess
    .filter((item) => item.canView)
    .map((item) => item.pageId);
  const editablePageIds = referencedPageAccess
    .filter((item) => item.canEdit)
    .map((item) => item.pageId);
  const hasPageEditAccess = hasPageContext && editablePageIds.length > 0;
  const primaryEditablePageId = requestBody.primaryPageId &&
      editablePageIds.includes(requestBody.primaryPageId)
    ? requestBody.primaryPageId
    : null;
  const capabilityPolicy = resolveAgentCapabilityPolicy({
    canEditAttachedPages: hasPageEditAccess,
  });
  const connectorTools = isToolkitConfigured(input.env)
    ? await buildToolkitTools({
        env: input.env,
        signal: input.abortSignal,
        sources: requestBody.sources,
        userId: auth.userId,
        workspaceId,
      })
    : getRuntimeAdapter().buildConnectorTools?.({
        env: input.env,
        sources: requestBody.sources,
        userId: auth.userId,
        workspaceId,
      }) ?? {};

  if (hasPageContext) {
    console.warn(
      `AI chat page access: clientCanEdit=${requestBody.canEditPages} readableIds=${readablePageIds.join(",") || "(none)"} editableIds=${editablePageIds.join(",") || "(none)"} primaryEditableId=${primaryEditablePageId ?? "(none)"}`,
    );
  }

  const workspaceReadTools = buildWorkspaceReadTools({
    userId: auth.userId,
    workspaceId,
    withDb: (fn) => input.withDb(fn),
  });
  const tools: ToolSet = {
    ...workspaceReadTools,
    ...(hasPageEditAccess
      ? {
          ...buildPageEditTools(editablePageIds),
          ...buildDatabaseConfigTools({
            allowedPageIds: new Set(editablePageIds),
            env: input.env,
            workspaceId,
            primaryPageId: primaryEditablePageId,
            userId: auth.userId,
            withDb: (fn) => input.withDb(fn),
          }),
        }
      : {}),
    ...connectorTools,
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
          allowedPageIds: editablePageIds,
          primaryPageId: primaryEditablePageId,
        }),
        buildDatabaseConfigInstruction({
          allowedPageIds: editablePageIds,
          primaryPageId: primaryEditablePageId,
        }),
      ].join("")
    : "";
  const sourceInstruction = buildSourceInstruction({
    hasConnectorTools: Object.keys(connectorTools).length > 0,
    hasPageContext,
    sources: requestBody.sources,
  });
  const policyInstruction = buildAgentPolicyInstruction(capabilityPolicy);

  const result = streamText({
    abortSignal: input.abortSignal,
    maxOutputTokens: 1600,
    model,
    messages: persistedMessages,
    stopWhen: stepCountIs(15),
    tools: hasTools ? tools : undefined,
    temperature: 0.2,
    system: `${SYSTEM_PROMPT}${pageEditInstruction}${pageContextInstruction}\n${policyInstruction}\n${sourceInstruction}`,
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
    "## Zilobase page context",
    "The following markdown describes the current Zilobase page and any attached pages or databases.",
    "Answer questions about this page, page content, databases, properties, and rows using this context first.",
    "Do not say you lack access to the page when this context is present.",
    "",
    pageContext,
  ].join("\n");
}

function buildSourceInstruction(input: {
  hasConnectorTools: boolean;
  hasPageContext: boolean;
  sources: SourceId[];
}) {
  if (input.hasConnectorTools) {
    return input.sources.length > 0
      ? `Only use these selected sources for this request: ${input.sources.join(", ")}.`
      : "Use all connected integration sources when the user asks about external tools.";
  }

  if (input.hasPageContext) {
    return "No external integration sources are connected. Answer page questions from the Zilobase page context above.";
  }

  return "No external integration sources are connected. Use the permission-scoped Zilobase workspace tools for workspace questions, and answer general questions from general knowledge.";
}

async function resolveReferencedPageAccess(input: {
  pageIds: string[];
  userId: string;
  workspaceId: string;
}) {
  return Promise.all(
    [...new Set(input.pageIds)].map(async (pageId) => {
      const canEdit = await canAccessPageInWorkspace(
        pageId,
        input.workspaceId,
        input.userId,
        "edit",
      );
      const canView = canEdit || await canAccessPageInWorkspace(
        pageId,
        input.workspaceId,
        input.userId,
        "view",
      );

      return { canEdit, canView, pageId };
    }),
  );
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

function toProviderErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "The AI provider failed while processing this request.";
}
