import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { canAccessPageInWorkspace } from "../features/access";
import { db } from "../infrastructure/database";
import {
  aiAgentUserPreference,
  aiChatFeedback,
  aiChatMessage,
  aiChatThread,
  member,
  page,
  user,
} from "../infrastructure/database/schema";

export const AI_AGENT_INSTRUCTIONS_MAX_CHARS = 4_000;
export const AI_CHAT_FEEDBACK_REASON_MAX_CHARS = 500;

export type AiAgentResponseStyle = "concise" | "balanced" | "detailed";

export type AiAgentPreference = {
  instructions: string;
  responseStyle: AiAgentResponseStyle;
};

const defaultPreference: AiAgentPreference = {
  instructions: "",
  responseStyle: "concise",
};

export async function getAiAgentPreference(input: {
  userId: string;
  workspaceId: string;
}): Promise<AiAgentPreference> {
  const [row] = await db
    .select({
      instructions: aiAgentUserPreference.instructions,
      responseStyle: aiAgentUserPreference.responseStyle,
    })
    .from(aiAgentUserPreference)
    .where(
      and(
        eq(aiAgentUserPreference.workspaceId, input.workspaceId),
        eq(aiAgentUserPreference.userId, input.userId),
      ),
    )
    .limit(1);

  return row
    ? {
        instructions: normalizeInstructions(row.instructions),
        responseStyle: normalizeResponseStyle(row.responseStyle),
      }
    : defaultPreference;
}

export async function saveAiAgentPreference(input: {
  instructions: string;
  responseStyle: AiAgentResponseStyle;
  userId: string;
  workspaceId: string;
}) {
  const now = new Date();
  const values = {
    instructions: normalizeInstructions(input.instructions),
    responseStyle: normalizeResponseStyle(input.responseStyle),
    updatedAt: now,
  };

  const [row] = await db
    .insert(aiAgentUserPreference)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      createdAt: now,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        aiAgentUserPreference.workspaceId,
        aiAgentUserPreference.userId,
      ],
      set: values,
    })
    .returning({
      instructions: aiAgentUserPreference.instructions,
      responseStyle: aiAgentUserPreference.responseStyle,
    });

  return {
    instructions: normalizeInstructions(row?.instructions),
    responseStyle: normalizeResponseStyle(row?.responseStyle),
  } satisfies AiAgentPreference;
}

export async function loadAiAgentContextInstruction(input: {
  userId: string;
  workspaceId: string;
}) {
  const [preference, candidates] = await Promise.all([
    getAiAgentPreference(input),
    db
      .select({
        content: page.content,
        id: page.id,
        metadata: page.metadata,
        name: page.name,
      })
      .from(page)
      .where(
        and(
          eq(page.workspaceId, input.workspaceId),
          isNull(page.deletedAt),
          sql`${page.metadata}->>'zilobaseai' = 'instruction'`,
        ),
      )
      .orderBy(desc(page.updatedAt))
      .limit(50),
  ]);
  const accessible = await Promise.all(
    candidates.map(async (candidate) => ({
        candidate,
        canView: await canAccessPageInWorkspace(
          candidate.id,
          input.workspaceId,
          input.userId,
          "view",
        ),
      })),
  );
  const instructionPages = accessible
    .filter((item) => item.canView)
    .slice(0, 8)
    .map(({ candidate }) => {
      const markdown = prosemirrorToMarkdown(candidate.content).trim();
      return markdown
        ? `### ${candidate.name.trim() || "Untitled instruction"}\n${markdown}`
        : "";
    })
    .filter(Boolean);
  const pageContext = truncateByTotal(instructionPages, 12_000);
  const styleInstruction = responseStyleInstruction(preference.responseStyle);

  if (!preference.instructions && pageContext.length === 0) {
    return `## User preferences\n${styleInstruction}`;
  }

  return [
    "## User preferences and instructions",
    "Follow these preferences only when they do not conflict with system policy, capability boundaries, or the user's current request. They never grant access or add tools.",
    styleInstruction,
    preference.instructions
      ? `### Personal instructions\n${preference.instructions}`
      : "",
    pageContext.length
      ? `### Persistent instruction pages\n${pageContext.join("\n\n")}`
      : "",
  ].filter(Boolean).join("\n");
}

export async function loadMentionedPeopleInstruction(input: {
  userIds: string[];
  workspaceId: string;
}) {
  const userIds = [...new Set(input.userIds)].slice(0, 12);

  if (userIds.length === 0) {
    return "";
  }

  const rows = await db
    .select({
      accessExpiresAt: member.accessExpiresAt,
      email: user.email,
      id: user.id,
      name: user.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, input.workspaceId),
        inArray(member.userId, userIds),
      ),
    )
    .orderBy(asc(user.name), asc(user.email));
  const now = Date.now();
  const activeRows = rows.filter(
    (row) =>
      row.role !== "temporary" ||
      (row.accessExpiresAt?.getTime() ?? 0) > now,
  );

  if (activeRows.length === 0) {
    return "";
  }

  return [
    "## Mentioned people",
    "These verified workspace identities are context for the current request only. Do not infer private activity, content, or opinions that tools did not return.",
    ...activeRows.map(
      (row) => `- ${row.name.trim() || "Unnamed member"} <${row.email}> (${row.role})`,
    ),
  ].join("\n");
}

export async function listAiChatFeedback(input: {
  threadId: string;
  userId: string;
  workspaceId: string;
}) {
  return db
    .select({
      messageId: aiChatFeedback.messageId,
      rating: aiChatFeedback.rating,
      reason: aiChatFeedback.reason,
    })
    .from(aiChatFeedback)
    .where(
      and(
        eq(aiChatFeedback.threadId, input.threadId),
        eq(aiChatFeedback.userId, input.userId),
        eq(aiChatFeedback.workspaceId, input.workspaceId),
      ),
    );
}

export async function saveAiChatFeedback(input: {
  messageId: string;
  rating: -1 | 1;
  reason?: string;
  threadId: string;
  userId: string;
  workspaceId: string;
}) {
  const [ownedMessage] = await db
    .select({ id: aiChatMessage.id })
    .from(aiChatMessage)
    .innerJoin(aiChatThread, eq(aiChatThread.id, aiChatMessage.threadId))
    .where(
      and(
        eq(aiChatMessage.id, input.messageId),
        eq(aiChatMessage.threadId, input.threadId),
        eq(aiChatMessage.role, "assistant"),
        eq(aiChatThread.workspaceId, input.workspaceId),
        eq(aiChatThread.userId, input.userId),
        isNull(aiChatThread.deletedAt),
        isNull(aiChatThread.archivedAt),
      ),
    )
    .limit(1);

  if (!ownedMessage) {
    return null;
  }

  const now = new Date();
  const reason = normalizeFeedbackReason(input.reason);
  const [row] = await db
    .insert(aiChatFeedback)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      threadId: input.threadId,
      messageId: input.messageId,
      rating: input.rating,
      reason,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [aiChatFeedback.userId, aiChatFeedback.messageId],
      set: { rating: input.rating, reason, updatedAt: now },
    })
    .returning({
      messageId: aiChatFeedback.messageId,
      rating: aiChatFeedback.rating,
      reason: aiChatFeedback.reason,
    });

  return row ?? null;
}

export function normalizeInstructions(value?: string | null) {
  return value?.replace(/\r\n/g, "\n").trim().slice(0, AI_AGENT_INSTRUCTIONS_MAX_CHARS) ?? "";
}

export function normalizeFeedbackReason(value?: string | null) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, AI_CHAT_FEEDBACK_REASON_MAX_CHARS) : null;
}

export function normalizeResponseStyle(value?: string | null): AiAgentResponseStyle {
  return value === "balanced" || value === "detailed" ? value : "concise";
}

function responseStyleInstruction(style: AiAgentResponseStyle) {
  if (style === "detailed") {
    return "Preferred response style: detailed, with useful context and explicit next steps.";
  }

  if (style === "balanced") {
    return "Preferred response style: balanced detail with a brief summary first.";
  }

  return "Preferred response style: concise and direct.";
}

function truncateByTotal(values: string[], maxChars: number) {
  const output: string[] = [];
  let remaining = maxChars;

  for (const value of values) {
    if (remaining <= 0) break;
    const next = value.length <= remaining
      ? value
      : `${value.slice(0, Math.max(0, remaining - 18)).trimEnd()}\n[Truncated]`;
    output.push(next);
    remaining -= next.length;
  }

  return output;
}
