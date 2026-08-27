import type { UIMessage } from "ai";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../db";
import { aiChatMessage, aiChatThread, aiChatThreadSummary } from "../db/schema";

const DEFAULT_AI_CHAT_THREAD_TITLE = "New chat";
const MAX_AI_CHAT_MESSAGES_PER_THREAD = 500;

export type AiChatThreadRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
};

export async function listAiChatThreads(
  workspaceId: string,
  userId: string,
  search?: string,
): Promise<AiChatThreadRecord[]> {
  const normalizedSearch = normalizeThreadSearch(search);
  const pattern = normalizedSearch ? `%${normalizedSearch}%` : null;
  const filters = [
    eq(aiChatThread.workspaceId, workspaceId),
    eq(aiChatThread.userId, userId),
    isNull(aiChatThread.deletedAt),
    isNull(aiChatThread.archivedAt),
  ];

  if (pattern) {
    filters.push(
      or(
        ilike(aiChatThread.title, pattern),
        sql`exists (
          select 1 from ${aiChatMessage}
          where ${aiChatMessage.threadId} = ${aiChatThread.id}
            and ${aiChatMessage.role} in ('user', 'assistant')
            and ${aiChatMessage.parts}::text ilike ${pattern}
        )`,
      )!,
    );
  }

  const rows = await db
    .select({
      id: aiChatThread.id,
      workspaceId: aiChatThread.workspaceId,
      userId: aiChatThread.userId,
      title: aiChatThread.title,
      pinnedAt: aiChatThread.pinnedAt,
      createdAt: aiChatThread.createdAt,
      updatedAt: aiChatThread.updatedAt,
      lastActivityAt: aiChatThread.lastActivityAt,
    })
    .from(aiChatThread)
    .where(and(...filters))
    .orderBy(
      sql`${aiChatThread.pinnedAt} desc nulls last`,
      desc(aiChatThread.lastActivityAt),
    );

  return rows;
}

export async function createAiChatThread(input: {
  workspaceId: string;
  userId: string;
  title?: string;
}) {
  const now = new Date();
  const id = crypto.randomUUID();
  const title = normalizeThreadTitle(input.title) ?? DEFAULT_AI_CHAT_THREAD_TITLE;

  await db.insert(aiChatThread).values({
    id,
    workspaceId: input.workspaceId,
    userId: input.userId,
    title,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  });

  return getAiChatThreadForUser({
    workspaceId: input.workspaceId,
    threadId: id,
    userId: input.userId,
  });
}

export async function getAiChatThreadForUser(input: {
  workspaceId: string;
  threadId: string;
  userId: string;
}) {
  const [row] = await db
    .select({
      id: aiChatThread.id,
      workspaceId: aiChatThread.workspaceId,
      userId: aiChatThread.userId,
      title: aiChatThread.title,
      pinnedAt: aiChatThread.pinnedAt,
      createdAt: aiChatThread.createdAt,
      updatedAt: aiChatThread.updatedAt,
      lastActivityAt: aiChatThread.lastActivityAt,
    })
    .from(aiChatThread)
    .where(
      and(
        eq(aiChatThread.id, input.threadId),
        eq(aiChatThread.workspaceId, input.workspaceId),
        eq(aiChatThread.userId, input.userId),
        isNull(aiChatThread.deletedAt),
        isNull(aiChatThread.archivedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function renameAiChatThread(input: {
  workspaceId: string;
  threadId: string;
  title: string;
  userId: string;
}) {
  const title = normalizeThreadTitle(input.title);

  if (!title) {
    return null;
  }

  const now = new Date();
  const [row] = await db
    .update(aiChatThread)
    .set({
      title,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiChatThread.id, input.threadId),
        eq(aiChatThread.workspaceId, input.workspaceId),
        eq(aiChatThread.userId, input.userId),
        isNull(aiChatThread.deletedAt),
        isNull(aiChatThread.archivedAt),
      ),
    )
    .returning({
      id: aiChatThread.id,
      workspaceId: aiChatThread.workspaceId,
      userId: aiChatThread.userId,
      title: aiChatThread.title,
      pinnedAt: aiChatThread.pinnedAt,
      createdAt: aiChatThread.createdAt,
      updatedAt: aiChatThread.updatedAt,
      lastActivityAt: aiChatThread.lastActivityAt,
    });

  return row ?? null;
}

export async function setAiChatThreadPinned(input: {
  pinned: boolean;
  workspaceId: string;
  threadId: string;
  userId: string;
}) {
  const now = new Date();
  const [row] = await db
    .update(aiChatThread)
    .set({
      pinnedAt: input.pinned ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiChatThread.id, input.threadId),
        eq(aiChatThread.workspaceId, input.workspaceId),
        eq(aiChatThread.userId, input.userId),
        isNull(aiChatThread.deletedAt),
        isNull(aiChatThread.archivedAt),
      ),
    )
    .returning({
      id: aiChatThread.id,
      workspaceId: aiChatThread.workspaceId,
      userId: aiChatThread.userId,
      title: aiChatThread.title,
      pinnedAt: aiChatThread.pinnedAt,
      createdAt: aiChatThread.createdAt,
      updatedAt: aiChatThread.updatedAt,
      lastActivityAt: aiChatThread.lastActivityAt,
    });

  return row ?? null;
}

export async function archiveAiChatThread(input: {
  workspaceId: string;
  threadId: string;
  userId: string;
}) {
  const now = new Date();
  const [row] = await db
    .update(aiChatThread)
    .set({
      archivedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiChatThread.id, input.threadId),
        eq(aiChatThread.workspaceId, input.workspaceId),
        eq(aiChatThread.userId, input.userId),
        isNull(aiChatThread.deletedAt),
        isNull(aiChatThread.archivedAt),
      ),
    )
    .returning({ id: aiChatThread.id });

  return row ?? null;
}

export async function deleteAiChatThread(input: {
  workspaceId: string;
  threadId: string;
  userId: string;
}) {
  const now = new Date();
  const [row] = await db
    .update(aiChatThread)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiChatThread.id, input.threadId),
        eq(aiChatThread.workspaceId, input.workspaceId),
        eq(aiChatThread.userId, input.userId),
        isNull(aiChatThread.deletedAt),
        isNull(aiChatThread.archivedAt),
      ),
    )
    .returning({ id: aiChatThread.id });

  return row ?? null;
}

export async function touchAiChatThreadActivity(threadId: string) {
  const now = new Date();

  await db
    .update(aiChatThread)
    .set({
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiChatThread.id, threadId),
        isNull(aiChatThread.deletedAt),
        isNull(aiChatThread.archivedAt),
      ),
    );
}

export async function loadAiChatThreadMessages(threadId: string): Promise<UIMessage[]> {
  const rows = await db
    .select({
      clientId: aiChatMessage.clientId,
      id: aiChatMessage.id,
      role: aiChatMessage.role,
      parts: aiChatMessage.parts,
    })
    .from(aiChatMessage)
    .where(eq(aiChatMessage.threadId, threadId))
    .orderBy(asc(aiChatMessage.sequence), asc(aiChatMessage.createdAt));

  return rows
    .map((row) => toUiMessage(row))
    .filter((message): message is UIMessage => message !== null);
}

export async function syncAiChatThreadMessages(
  threadId: string,
  messages: readonly UIMessage[],
  options?: { deleteStaleRows?: boolean },
) {
  if (messages.length === 0) {
    if (options?.deleteStaleRows) {
      await db.delete(aiChatMessage).where(eq(aiChatMessage.threadId, threadId));
    }

    return;
  }

  const now = new Date();
  const keepIds = new Set(messages.map((message) => message.id));
  const persistableMessages = new Map<string, UIMessage>();

  for (const message of messages) {
    if (isPersistableUiMessage(message)) {
      persistableMessages.set(message.id, message);
    }
  }

  if (persistableMessages.size > 0) {
    await db
      .insert(aiChatMessage)
      .values(
        [...persistableMessages.values()].map((message, sequence) => ({
          id: message.id,
          threadId,
          role: message.role,
          parts: message.parts,
          sequence,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: aiChatMessage.id,
        set: {
          role: sql`excluded.${aiChatMessage.role}`,
          parts: sql`excluded.${aiChatMessage.parts}`,
          sequence: sql`excluded.${aiChatMessage.sequence}`,
          updatedAt: now,
        },
      });
  }

  if (options?.deleteStaleRows) {
    await db
      .delete(aiChatMessage)
      .where(
        and(
          eq(aiChatMessage.threadId, threadId),
          notInArray(aiChatMessage.id, [...keepIds]),
          ne(aiChatMessage.role, "data"),
        ),
      );
  }

  await enforceAiChatMessageLimit(threadId);
}

export async function appendCanonicalUserMessage(input: {
  clientMessageId: string;
  parts: UIMessage["parts"];
  threadId: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`ai-chat-thread:${input.threadId}`}))`,
    );

    const [existing] = await tx
      .select({ id: aiChatMessage.id, parts: aiChatMessage.parts })
      .from(aiChatMessage)
      .where(and(
        eq(aiChatMessage.threadId, input.threadId),
        eq(aiChatMessage.clientId, input.clientMessageId),
      ))
      .limit(1);
    if (existing) {
      if (JSON.stringify(existing.parts) !== JSON.stringify(input.parts)) {
        throw new Error("The client message id was reused with different content.");
      }
      return { duplicate: true as const, id: existing.id };
    }

    const sequence = await reserveMessageSequences(tx, input.threadId, 1);
    const id = crypto.randomUUID();
    const now = new Date();
    await tx.insert(aiChatMessage).values({
      clientId: input.clientMessageId,
      createdAt: now,
      id,
      parts: input.parts,
      role: "user",
      sequence,
      status: "completed",
      threadId: input.threadId,
      updatedAt: now,
    });
    return { duplicate: false as const, id };
  });
}

export async function appendCanonicalAssistantMessages(input: {
  messages: readonly UIMessage[];
  threadId: string;
  turnId: string;
  userClientMessageId: string;
}) {
  const assistantMessages = selectCanonicalAssistantMessages(
    input.messages,
    input.userClientMessageId,
  );
  if (assistantMessages.length === 0) return null;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`ai-chat-thread:${input.threadId}`}))`,
    );
    const clientIds = assistantMessages.map((message) => message.id);
    const existing = await tx
      .select({ clientId: aiChatMessage.clientId })
      .from(aiChatMessage)
      .where(and(
        eq(aiChatMessage.threadId, input.threadId),
        inArray(aiChatMessage.clientId, clientIds),
      ));
    const existingIds = new Set(existing.map((row) => row.clientId));
    const pending = assistantMessages.filter((message) => !existingIds.has(message.id));
    if (pending.length === 0) return null;

    const firstSequence = await reserveMessageSequences(tx, input.threadId, pending.length);
    const now = new Date();
    await tx.insert(aiChatMessage).values(pending.map((message, index) => ({
      clientId: message.id,
      createdAt: now,
      id: crypto.randomUUID(),
      parts: message.parts,
      role: "assistant",
      sequence: firstSequence + index,
      status: "completed",
      threadId: input.threadId,
      turnId: input.turnId,
      updatedAt: now,
    })));
    return firstSequence + pending.length - 1;
  });
}

export function selectCanonicalAssistantMessages(
  messages: readonly UIMessage[],
  userClientMessageId: string,
) {
  const userIndex = messages.findLastIndex(
    (message) => message.role === "user" && message.id === userClientMessageId,
  );

  return messages
    .slice(userIndex < 0 ? 0 : userIndex + 1)
    .filter((message) =>
      message.role === "assistant" && isPersistableUiMessage(message)
    );
}

export async function getAiChatThreadSummary(threadId: string) {
  const [summary] = await db
    .select()
    .from(aiChatThreadSummary)
    .where(eq(aiChatThreadSummary.threadId, threadId))
    .limit(1);
  return summary ?? null;
}

export async function maybeAutoTitleAiChatThread(
  threadId: string,
  messages: readonly UIMessage[],
) {
  const [thread] = await db
    .select({ title: aiChatThread.title })
    .from(aiChatThread)
    .where(and(eq(aiChatThread.id, threadId), isNull(aiChatThread.deletedAt)))
    .limit(1);

  if (!thread || thread.title !== DEFAULT_AI_CHAT_THREAD_TITLE) {
    return;
  }

  const derivedTitle = deriveThreadTitle(messages);

  if (!derivedTitle) {
    return;
  }

  await db
    .update(aiChatThread)
    .set({
      title: derivedTitle,
      updatedAt: new Date(),
    })
    .where(eq(aiChatThread.id, threadId));
}

function buildAiChatAgentInstanceName(input: {
  workspaceId: string;
  threadId: string;
  userId: string;
}) {
  return `org-${input.workspaceId}-user-${input.userId}-thread-${input.threadId}`;
}

export function parseAiChatAgentInstanceName(instance: string) {
  const match =
    /^org-(.+)-user-(.+)-thread-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      instance,
    );

  if (!match) {
    return null;
  }

  return {
    workspaceId: match[1],
    userId: match[2],
    threadId: match[3],
  };
}

function deriveThreadTitle(messages: readonly UIMessage[]) {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) {
        return truncateThreadTitle(part.text.trim());
      }
    }
  }

  return null;
}

function truncateThreadTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= 72) {
    return normalized;
  }

  return `${normalized.slice(0, 69).trimEnd()}...`;
}

function normalizeThreadTitle(title?: string) {
  const normalized = title?.replace(/\s+/g, " ").trim();

  return normalized ? normalized.slice(0, 120) : null;
}

export function normalizeThreadSearch(search?: string) {
  const normalized = search?.replace(/\s+/g, " ").trim();

  return normalized ? normalized.slice(0, 80) : null;
}

function isPersistableUiMessage(message: UIMessage) {
  return (
    typeof message.id === "string" &&
    message.id.length > 0 &&
    (message.role === "user" ||
      message.role === "assistant" ||
      message.role === "system" ||
      message.role === "data") &&
    Array.isArray(message.parts)
  );
}

function toUiMessage(row: {
  clientId?: string | null;
  id: string;
  role: string;
  parts: unknown[] | null;
}): UIMessage | null {
  if (
    !row.id ||
    (row.role !== "user" &&
      row.role !== "assistant" &&
      row.role !== "system" &&
      row.role !== "data") ||
    !Array.isArray(row.parts)
  ) {
    return null;
  }

  return {
    id: row.clientId ?? row.id,
    role: row.role as UIMessage["role"],
    parts: row.parts as UIMessage["parts"],
  };
}

async function enforceAiChatMessageLimit(threadId: string) {
  const rows = await db
    .select({ id: aiChatMessage.id })
    .from(aiChatMessage)
    .where(eq(aiChatMessage.threadId, threadId))
    .orderBy(desc(aiChatMessage.sequence), desc(aiChatMessage.createdAt))
    .offset(MAX_AI_CHAT_MESSAGES_PER_THREAD);

  if (rows.length === 0) {
    return;
  }

  await db
    .delete(aiChatMessage)
    .where(
      inArray(
        aiChatMessage.id,
        rows.map((row) => row.id),
      ),
    );
}

async function reserveMessageSequences(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  threadId: string,
  count: number,
) {
  const [thread] = await tx
    .update(aiChatThread)
    .set({
      nextMessageSequence: sql`${aiChatThread.nextMessageSequence} + ${count}`,
      updatedAt: new Date(),
    })
    .where(eq(aiChatThread.id, threadId))
    .returning({ nextMessageSequence: aiChatThread.nextMessageSequence });
  if (!thread) throw new Error("Chat thread not found.");
  return thread.nextMessageSequence - count;
}
