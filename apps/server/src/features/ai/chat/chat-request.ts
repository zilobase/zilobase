import type { AgentContextRef } from "./agent-context";

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
  clientTurnId?: string;
  userMessageId?: string;
  userClientMessageId?: string;
  contextRefs?: AgentContextRef[];
  debugStream: boolean;
};

const MAX_WORKSPACE_CONTEXT_CHARS = 32_000;

export function coerceAiChatRequestBody(body: unknown): AiChatRequestBody {
  if (!body || typeof body !== "object") return emptyAiChatRequestBody();

  const raw = body as Record<string, unknown>;
  const rawModelValue = typeof raw.model === "string"
    ? raw.model
    : typeof raw.modelId === "string"
      ? raw.modelId
      : "";
  const pageContextMeta = readPageContextMeta(raw);
  const contextRefs = readContextRefs(raw.contextRefs);
  const contextPrimaryPageId = contextRefs.find(
    (ref) => ref.type === "page" && ref.role === "primary",
  )?.id ?? null;

  return {
    allowedPageIds: readAllowedPageIds(raw, pageContextMeta, contextRefs),
    attachmentIds: readStringIds(raw.attachmentIds),
    clientTurnId: readOptionalString(raw.clientTurnId),
    contextRefs,
    debugStream: raw.debugStream === true,
    model: rawModelValue.trim() || undefined,
    mentionedUserIds: readStringIds(raw.mentionedUserIds).slice(0, 12),
    pageContext: readPageContext(raw),
    primaryPageId: contextPrimaryPageId ?? pageContextMeta.primaryId,
    threadId: readOptionalString(raw.threadId) ?? null,
    userClientMessageId:
      readOptionalString(raw.userClientMessageId) ??
      readOptionalString(raw.clientMessageId),
    userId: readOptionalString(raw.userId) ?? null,
    userMessageId:
      readOptionalString(raw.userMessageId) ??
      readOptionalString(raw.clientMessageId),
    workspaceId: readOptionalString(raw.workspaceId) ?? null,
  };
}

function emptyAiChatRequestBody(): AiChatRequestBody {
  return {
    allowedPageIds: [],
    attachmentIds: [],
    debugStream: false,
    mentionedUserIds: [],
    model: undefined,
    pageContext: null,
    primaryPageId: null,
    threadId: null,
    userId: null,
    workspaceId: null,
  };
}

function readStringIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0,
      ).map((item) => item.trim()))]
    : [];
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readContextRefs(value: unknown): AgentContextRef[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const id = readOptionalString(candidate.id);
    const role = candidate.role;
    const type = candidate.type;
    if (
      !id ||
      (role !== "primary" && role !== "attached") ||
      (type !== "page" && type !== "database")
    ) {
      return [];
    }

    const key = `${type}:${id}:${role}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{ id, role, type } as AgentContextRef];
  }).slice(0, 20);
}

function readPageContext(body: Record<string, unknown>) {
  const rawValue = body.pageContext;
  if (typeof rawValue !== "string") return null;

  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_WORKSPACE_CONTEXT_CHARS) return trimmed;

  return `${trimmed.slice(0, MAX_WORKSPACE_CONTEXT_CHARS)}\n\n[Page context truncated]`;
}

function readPageContextMeta(body: Record<string, unknown>) {
  const rawMeta = body.pageContextMeta;
  if (!rawMeta || typeof rawMeta !== "object") {
    return { attachmentIds: [] as string[], primaryId: null as string | null };
  }

  const meta = rawMeta as Record<string, unknown>;
  return {
    attachmentIds: readStringIds(meta.attachmentIds),
    primaryId: readOptionalString(meta.primaryId) ?? null,
  };
}

function readAllowedPageIds(
  body: Record<string, unknown>,
  pageContextMeta: { attachmentIds: string[]; primaryId: string | null },
  contextRefs: AgentContextRef[],
) {
  const fromBody = readStringIds(body.allowedPageIds);
  if (fromBody.length > 0) return fromBody;

  const ids = new Set<string>();
  if (pageContextMeta.primaryId) ids.add(pageContextMeta.primaryId);
  for (const attachmentId of pageContextMeta.attachmentIds) ids.add(attachmentId);
  for (const ref of contextRefs) {
    if (ref.type === "page") ids.add(ref.id);
  }
  return [...ids];
}
