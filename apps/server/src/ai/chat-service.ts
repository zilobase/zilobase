import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { canAccessPageInWorkspace, getMembership } from "../access";
import type { AppBindings } from "../types";
import {
  buildDatabaseConfigInstruction,
  buildDatabaseConfigTools,
} from "./ask-ai-database-tools";
import { buildPageEditTools } from "./ask-ai-page-tools";
import { buildWorkspaceReadTools } from "./ask-ai-workspace-tools";
import { buildWorkspaceActionTools } from "./ask-ai-workspace-action-tools";
import { resolveOpenAiChatModel } from "./ai-provider";
import {
  buildAgentPolicyInstruction,
  resolveAgentCapabilityPolicy,
} from "./agent-capabilities";
import {
  getAiChatThreadForUser,
  maybeAutoTitleAiChatThread,
  syncAiChatThreadMessages,
  touchAiChatThreadActivity,
} from "./chat-persistence";
import { resolveAiFileContext, withoutAiFileParts } from "./ai-file-context";
import { buildArtifactTools } from "./ask-ai-artifact-tools";
import { buildAnalysisTools } from "./ask-ai-analysis-tools";
import {
  loadAiAgentContextInstruction,
  loadMentionedPeopleInstruction,
} from "./agent-experience";
import {
  finishAiAgentToolExecution,
  finishAiAgentTurn,
  normalizeAiAgentErrorCode,
  reserveAiAgentTurn,
  startAiAgentToolExecution,
  summarizeAiAgentTurnInput,
} from "./agent-operations";

export type AiChatRequestBody = {
  attachmentIds: string[];
  allowedPageIds: string[];
  model: string | undefined;
  mentionedUserIds: string[];
  workspaceId: string | null;
  primaryPageId: string | null;
  threadId: string | null;
  userId: string | null;
  pageContext: string | null;
};

const MAX_WORKSPACE_CONTEXT_CHARS = 32_000;

const SYSTEM_PROMPT =
  "You are Zilobase's workspace agent. Complete bounded multi-step research and supported actions using tools, and clearly report partial failures. When Zilobase page context is provided, treat it as the authoritative source for questions about the current page, attached pages, embedded databases, properties, and rows shown in that context. Use searchWorkspace for workspace-wide discovery, readWorkspacePage for a page's stored body, readPageComments only when comments matter, and queryWorkspaceDatabase for current structured rows and properties. Use citation URLs returned by tools when attributing workspace facts."
  + " Zilobase database and page configuration tools may create and update Zilobase pages, databases, properties, rows, views, and embeds when the user asks."
  + " Prefer concise answers with dates, participants, links, and page titles when useful.";

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

  const reservation = await input.withDb(() =>
    reserveAiAgentTurn({
      env: input.env,
      metrics: summarizeAiAgentTurnInput(
        input.messages,
        requestBody.attachmentIds,
      ),
      requestedModel: requestBody.model ?? "auto",
      threadId: auth.threadId,
      userId: auth.userId,
      workspaceId,
    }),
  );

  if (!reservation.ok) {
    return Response.json(
      {
        code: reservation.rejection.code,
        error: reservation.rejection.message,
        message: reservation.rejection.message,
        retryAfterSeconds: reservation.rejection.retryAfterSeconds,
      },
      {
        headers: reservation.rejection.retryAfterSeconds > 0
          ? { "retry-after": String(reservation.rejection.retryAfterSeconds) }
          : undefined,
        status: reservation.rejection.retryAfterSeconds > 0 ? 429 : 413,
      },
    );
  }

  try {
    const hasPageContext = Boolean(requestBody.pageContext);
    const referencedPageAccess = await input.withDb(() =>
      resolveReferencedPageAccess({
        pageIds: requestBody.allowedPageIds,
        userId: auth.userId,
        workspaceId,
      }),
    );
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
    const workspaceReadTools = buildWorkspaceReadTools({
      userId: auth.userId,
      workspaceId,
      withDb: (fn) => input.withDb(fn),
    });
    const databaseConfigTools = buildDatabaseConfigTools({
      allowedPageIds: new Set(editablePageIds),
      env: input.env,
      workspaceId,
      primaryPageId: primaryEditablePageId,
      threadId: auth.threadId,
      userId: auth.userId,
      withDb: (fn) => input.withDb(fn),
    });
    const workspaceActionTools = buildWorkspaceActionTools({
      env: input.env,
      threadId: auth.threadId,
      userId: auth.userId,
      workspaceId,
      withDb: (fn) => input.withDb(fn),
    });
    const artifactTools = buildArtifactTools({
      env: input.env,
      threadId: auth.threadId,
      userId: auth.userId,
      workspaceId,
      withDb: (fn) => input.withDb(fn),
    });
    const tools: ToolSet = {
      ...buildAnalysisTools(),
      ...workspaceReadTools,
      ...workspaceActionTools,
      ...artifactTools,
      ...databaseConfigTools,
      ...(hasPageEditAccess
        ? {
            ...buildPageEditTools(editablePageIds),
          }
        : {}),
    };

    const model = resolveOpenAiChatModel(input.env.OPENAI_API_KEY, requestBody.model);
    const chatMessages = withoutAiFileParts(input.messages).filter(
      (message) => (message.role as string) !== "data",
    );
    const persistedMessages = await convertToModelMessages(chatMessages);
    const fileContext = await input.withDb(() =>
      resolveAiFileContext({
        env: input.env,
        messages: input.messages,
        requestedFileIds: requestBody.attachmentIds,
        threadId: auth.threadId,
        userId: auth.userId,
        workspaceId,
      }),
    );
    const modelMessages: ModelMessage[] = [
      ...persistedMessages,
      ...fileContext.modelMessages,
    ];
    const hasTools = Object.keys(tools).length > 0;
    const pageContextInstruction = buildPageContextInstruction(
      requestBody.pageContext,
    );
    const pageEditInstruction = [
      hasPageEditAccess
        ? buildPageEditInstruction({
            allowedPageIds: editablePageIds,
            primaryPageId: primaryEditablePageId,
          })
        : "",
      buildDatabaseConfigInstruction({
        allowedPageIds: editablePageIds,
        primaryPageId: primaryEditablePageId,
      }),
    ].join("");
    const policyInstruction = buildAgentPolicyInstruction(capabilityPolicy);
    const [experienceInstruction, mentionedPeopleInstruction] =
      await input.withDb(() => Promise.all([
        loadAiAgentContextInstruction({
          userId: auth.userId,
          workspaceId,
        }),
        loadMentionedPeopleInstruction({
          userIds: requestBody.mentionedUserIds,
          workspaceId,
        }),
      ]));

    const result = streamText({
      abortSignal: input.abortSignal,
      maxOutputTokens: reservation.limits.maxOutputTokens,
      maxRetries: reservation.limits.maxRetries,
      model,
      messages: modelMessages,
      stopWhen: stepCountIs(reservation.limits.maxSteps),
      tools: hasTools ? tools : undefined,
      temperature: 0.2,
      timeout: {
        chunkMs: reservation.limits.streamChunkTimeoutMs,
        stepMs: reservation.limits.streamStepTimeoutMs,
        totalMs: reservation.limits.turnTimeoutMs,
      },
      system: `${SYSTEM_PROMPT}${pageEditInstruction}${pageContextInstruction}${fileContext.instruction}\n${policyInstruction}\n${experienceInstruction}\n${mentionedPeopleInstruction}`,
      experimental_onToolCallStart: ({ stepNumber, toolCall }) =>
        persistAiAgentAudit(input, () =>
          startAiAgentToolExecution({
            stepNumber,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            turnId: reservation.id,
          }),
        ),
      experimental_onToolCallFinish: ({
        durationMs,
        error,
        success,
        toolCall,
      }) =>
        persistAiAgentAudit(input, () =>
          finishAiAgentToolExecution({
            durationMs,
            error,
            success,
            toolCallId: toolCall.toolCallId,
            turnId: reservation.id,
          }),
        ),
      onError: async ({ error }) => {
        console.warn(`AI chat ${auth.userId}: ${toProviderErrorMessage(error)}`);
        await persistAiAgentAudit(input, () =>
          finishAiAgentTurn({
            errorCode: normalizeAiAgentErrorCode(error),
            status: "failed",
            turnId: reservation.id,
          }),
        );
      },
      onAbort: async ({ steps }) => {
        await persistAiAgentAudit(input, () =>
          finishAiAgentTurn({
            errorCode: "cancelled",
            status: "cancelled",
            stepCount: steps.length,
            toolCallCount: countToolCalls(steps),
            turnId: reservation.id,
          }),
        );
      },
      onFinish: async (event) => {
        const failed = event.finishReason === "error";
        await persistAiAgentAudit(input, () =>
          finishAiAgentTurn({
            errorCode: failed ? "provider_or_tool_failed" : null,
            inputTokens: event.totalUsage.inputTokens,
            outputTokens: event.totalUsage.outputTokens,
            status: failed ? "failed" : "succeeded",
            stepCount: event.steps.length,
            toolCallCount: countToolCalls(event.steps),
            totalTokens: event.totalUsage.totalTokens,
            turnId: reservation.id,
          }),
        );
        await input.onStreamFinish?.(event);
      },
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
  } catch (error) {
    await persistAiAgentAudit(input, () =>
      finishAiAgentTurn({
        errorCode: normalizeAiAgentErrorCode(error),
        status: error instanceof Error && error.name === "AbortError"
          ? "cancelled"
          : "failed",
        turnId: reservation.id,
      }),
    );
    throw error;
  }
}

export function coerceAiChatRequestBody(body: unknown): AiChatRequestBody {
  if (!body || typeof body !== "object") {
    return {
      allowedPageIds: [],
      attachmentIds: [],
      primaryPageId: null,
      model: undefined,
      mentionedUserIds: [],
      workspaceId: null,
      threadId: null,
      userId: null,
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
  const pageContextMeta = readPageContextMeta(raw);

  return {
    allowedPageIds: readAllowedPageIds(raw, pageContextMeta),
    attachmentIds: readStringIds(raw.attachmentIds),
    model: rawModel,
    mentionedUserIds: readStringIds(raw.mentionedUserIds).slice(0, 12),
    primaryPageId: pageContextMeta.primaryId,
    workspaceId: rawWorkspaceId.length > 0 ? rawWorkspaceId : null,
    threadId: rawThreadId.length > 0 ? rawThreadId : null,
    userId: rawUserId.length > 0 ? rawUserId : null,
    pageContext: readPageContext(raw),
  };
}

function readStringIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0,
      ).map((item) => item.trim()))]
    : [];
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

function countToolCalls(steps: Array<{ toolCalls: readonly unknown[] }>) {
  return steps.reduce((total, step) => total + step.toolCalls.length, 0);
}

async function persistAiAgentAudit(
  input: { withDb<T>(fn: () => Promise<T>): Promise<T> },
  operation: () => Promise<unknown>,
) {
  try {
    await input.withDb(operation);
  } catch (error) {
    console.error(
      JSON.stringify({
        code: normalizeAiAgentErrorCode(error),
        event: "ai_agent_audit_write_failed",
      }),
    );
  }
}
