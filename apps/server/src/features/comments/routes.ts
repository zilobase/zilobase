import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  getEffectivePageAccessInWorkspace,
  getPageRecord,
  hasAccess,
} from "../../access";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import { db } from "../../db";
import {
  commentMessage,
  commentReaction,
  commentThread,
  user,
  page,
} from "../../db/schema";
import type { AppBindings } from "../../types";

const MAX_COMMENT_BODY_LENGTH = 10_000;
const MAX_REACTION_EMOJI_LENGTH = 32;

export const commentRoutes = new Hono<AppBindings>();

const requireUser = (c: Context<AppBindings>) => c.get("user") ?? null;

const readCommentBody = async (c: Context<AppBindings>) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return { error: "A JSON body is required" };
  }

  const value = (body as { body?: unknown }).body;

  if (typeof value !== "string") {
    return { error: "body must be a string" };
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { error: "body is required" };
  }

  if (trimmedValue.length > MAX_COMMENT_BODY_LENGTH) {
    return { error: `body must be ${MAX_COMMENT_BODY_LENGTH} characters or fewer` };
  }

  return { body: trimmedValue };
};

const readReactionEmoji = async (c: Context<AppBindings>) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return { error: "A JSON body is required" };
  }

  const value = (body as { emoji?: unknown }).emoji;

  if (typeof value !== "string") {
    return { error: "emoji must be a string" };
  }

  const emoji = value.trim();

  if (!emoji) {
    return { error: "emoji is required" };
  }

  if (emoji.length > MAX_REACTION_EMOJI_LENGTH) {
    return {
      error: `emoji must be ${MAX_REACTION_EMOJI_LENGTH} characters or fewer`,
    };
  }

  return { emoji };
};

const getActiveThread = async (pageId: string) => {
  const [thread] = await db
    .select()
    .from(commentThread)
    .where(
      and(
        eq(commentThread.pageId, pageId),
        isNull(commentThread.resolvedAt),
        isNull(commentThread.deletedAt),
      ),
    )
    .orderBy(desc(commentThread.lastActivityAt))
    .limit(1);

  return thread ?? null;
};

type CommentThreadRecord = typeof commentThread.$inferSelect;

const getThreadsCommentsPayload = async (
  threads: CommentThreadRecord[],
  currentUserId?: string,
) => {
  if (threads.length === 0) {
    return [];
  }

  const comments = await db
    .select()
    .from(commentMessage)
    .where(inArray(commentMessage.threadId, threads.map((thread) => thread.id)))
    .orderBy(asc(commentMessage.createdAt));
  const authorIds = [
    ...new Set(
      comments
        .map((comment) => comment.authorId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const messageIds = comments.map((comment) => comment.id);
  const [authors, reactionRows] = await Promise.all([
    authorIds.length
      ? db
          .select({
            email: user.email,
            id: user.id,
            image: user.image,
            name: user.name,
          })
          .from(user)
          .where(inArray(user.id, authorIds))
      : Promise.resolve([]),
    messageIds.length
      ? db
          .select({
            createdAt: commentReaction.createdAt,
            emoji: commentReaction.emoji,
            messageId: commentReaction.messageId,
            userId: commentReaction.userId,
          })
          .from(commentReaction)
          .where(inArray(commentReaction.messageId, messageIds))
      : Promise.resolve([]),
  ]);
  const authorById = new Map(authors.map((author) => [author.id, author]));
  const reactionsByMessageId = new Map<
    string,
    Map<
      string,
      { count: number; firstCreatedAt: Date; reactedByMe: boolean }
    >
  >();

  for (const reaction of reactionRows) {
    const reactionsByEmoji =
      reactionsByMessageId.get(reaction.messageId) ??
      new Map<
        string,
        { count: number; firstCreatedAt: Date; reactedByMe: boolean }
      >();
    const currentReaction = reactionsByEmoji.get(reaction.emoji) ?? {
      count: 0,
      firstCreatedAt: reaction.createdAt,
      reactedByMe: false,
    };

    reactionsByEmoji.set(reaction.emoji, {
      count: currentReaction.count + 1,
      firstCreatedAt:
        reaction.createdAt < currentReaction.firstCreatedAt
          ? reaction.createdAt
          : currentReaction.firstCreatedAt,
      reactedByMe:
        currentReaction.reactedByMe || reaction.userId === currentUserId,
    });
    reactionsByMessageId.set(reaction.messageId, reactionsByEmoji);
  }

  const commentsByThreadId = new Map<string, typeof comments>();

  for (const comment of comments) {
    const threadComments = commentsByThreadId.get(comment.threadId);

    if (threadComments) {
      threadComments.push(comment);
    } else {
      commentsByThreadId.set(comment.threadId, [comment]);
    }
  }

  return threads.map((thread) => ({
    thread,
    comments: (commentsByThreadId.get(thread.id) ?? []).map((comment) => ({
      ...comment,
      author: comment.authorId ? authorById.get(comment.authorId) ?? null : null,
      reactions: Array.from(
        reactionsByMessageId.get(comment.id)?.entries() ?? [],
      )
        .map(([emoji, reaction]) => ({
          count: reaction.count,
          emoji,
          reactedByMe: reaction.reactedByMe,
          firstCreatedAt: reaction.firstCreatedAt,
        }))
        .sort(
          (left, right) =>
            left.firstCreatedAt.getTime() - right.firstCreatedAt.getTime(),
        )
        .map(({ firstCreatedAt: _firstCreatedAt, ...reaction }) => reaction),
    })),
  }));
};

const getThreadCommentsPayload = async (
  thread: CommentThreadRecord | null | undefined,
  currentUserId?: string,
) => {
  if (!thread) {
    return { comments: [], thread: null };
  }

  const [payload] = await getThreadsCommentsPayload([thread], currentUserId);

  return payload ?? { comments: [], thread: null };
};

const getPageCommentsPayload = async (
  pageId: string,
  currentUserId?: string,
) => {
  const thread = await getActiveThread(pageId);
  return getThreadCommentsPayload(thread, currentUserId);
};

const getMessageContext = async (
  messageId: string,
  pageId: string,
) => {
  const [record] = await db
    .select({ message: commentMessage, thread: commentThread, page })
    .from(commentMessage)
    .innerJoin(commentThread, eq(commentMessage.threadId, commentThread.id))
    .innerJoin(page, eq(commentThread.pageId, page.id))
    .where(
      and(
        eq(commentMessage.id, messageId),
        eq(commentThread.pageId, pageId),
        isNull(commentThread.deletedAt),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);

  return record ?? null;
};

const getPageForCommentRoute = async (
  c: Context<AppBindings>,
  minimumAccess: "view" | "edit",
) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return { error: c.json({ error: "Unauthorized" }, 401) };
  }

  const pageId = c.req.param("id");

  if (!pageId) {
    return { error: c.json({ error: "Page not found" }, 404) };
  }

  const record = await getPageRecord(pageId);

  if (!record) {
    return { error: c.json({ error: "Page not found" }, 404) };
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, record.workspaceId);

  if (mismatch) {
    return { error: mismatch };
  }

  const accessLevel = await getEffectivePageAccessInWorkspace(
    record.id,
    record.workspaceId,
    requestUser.id,
  );

  if (!hasAccess(accessLevel, minimumAccess)) {
    return { error: c.json({ error: "Forbidden" }, 403) };
  }

  return { accessLevel, requestUser, page: record };
};

commentRoutes.get("/pages/:id/comments", async (c) => {
  const context = await getPageForCommentRoute(c, "view");

  if ("error" in context) {
    return context.error;
  }

  const threadId = c.req.query("threadId");
  if (threadId) {
    const [specificThread] = await db
      .select()
      .from(commentThread)
      .where(
        and(
          eq(commentThread.id, threadId),
          eq(commentThread.pageId, context.page.id),
          isNull(commentThread.deletedAt),
        ),
      )
      .limit(1);

    return c.json(
      await getThreadCommentsPayload(specificThread, context.requestUser.id),
    );
  }

  return c.json(
    await getPageCommentsPayload(
      context.page.id,
      context.requestUser.id,
    ),
  );
});

commentRoutes.get("/pages/:id/threads", async (c) => {
  const context = await getPageForCommentRoute(c, "view");

  if ("error" in context) {
    return context.error;
  }

  // The editor only needs thread metadata and counts here. Loading every
  // message, author, and reaction made opening a page proportional to the
  // complete discussion history; each thread fetches its detail on demand.
  const threads = await db
    .select({
      commentCount: count(commentMessage.id),
      thread: commentThread,
    })
    .from(commentThread)
    .leftJoin(commentMessage, eq(commentMessage.threadId, commentThread.id))
    .where(
      and(
        eq(commentThread.pageId, context.page.id),
        isNull(commentThread.deletedAt),
      ),
    )
    .groupBy(commentThread.id)
    .orderBy(desc(commentThread.lastActivityAt));

  return c.json({
    threads: threads.map(({ commentCount, thread }) => ({
      commentCount: Number(commentCount),
      thread,
    })),
  });
});

commentRoutes.post("/pages/:id/comments", async (c) => {
  const context = await getPageForCommentRoute(c, "edit");

  if ("error" in context) {
    return context.error;
  }

  const parsed = await readCommentBody(c);

  if ("error" in parsed) {
    return c.json({ error: parsed.error }, 400);
  }

  const threadId = await db.transaction(async (tx) => {
    const now = new Date();
    const [activeThread] = await tx
      .select()
      .from(commentThread)
      .where(
        and(
          eq(commentThread.pageId, context.page.id),
          isNull(commentThread.resolvedAt),
          isNull(commentThread.deletedAt),
        ),
      )
      .orderBy(desc(commentThread.lastActivityAt))
      .limit(1);
    const threadId = activeThread?.id ?? crypto.randomUUID();

    if (!activeThread) {
      await tx.insert(commentThread).values({
        id: threadId,
        workspaceId: context.page.workspaceId,
        pageId: context.page.id,
        createdById: context.requestUser.id,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      });
    }

    await tx.insert(commentMessage).values({
      id: crypto.randomUUID(),
      threadId,
      authorId: context.requestUser.id,
      body: parsed.body,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(commentThread)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(commentThread.id, threadId));

    return threadId;
  });

  return c.json(
    await getThreadCommentsPayload(
      (
        await db
          .select()
          .from(commentThread)
          .where(eq(commentThread.id, threadId))
          .limit(1)
      )[0],
      context.requestUser.id,
    ),
    201,
  );
});

commentRoutes.patch("/pages/:id/comments/thread/resolve", async (c) => {
  const context = await getPageForCommentRoute(c, "edit");

  if ("error" in context) {
    return context.error;
  }

  const body = await c.req.json().catch(() => ({})) as { threadId?: string };
  let thread: any = null;

  if (body.threadId) {
    const [t] = await db
      .select()
      .from(commentThread)
      .where(
        and(
          eq(commentThread.id, body.threadId),
          eq(commentThread.pageId, context.page.id),
          isNull(commentThread.deletedAt),
        ),
      )
      .limit(1);
    thread = t ?? null;
  } else {
    thread = await getActiveThread(context.page.id);
  }

  if (!thread) {
    return c.json({ error: "Comment thread not found" }, 404);
  }

  const now = new Date();

  await db
    .update(commentThread)
    .set({
      resolvedAt: now,
      resolvedById: context.requestUser.id,
      updatedAt: now,
    })
    .where(eq(commentThread.id, thread.id));

  return c.json(
    await getThreadCommentsPayload(
      {
        ...thread,
        resolvedAt: now,
        resolvedById: context.requestUser.id,
        updatedAt: now,
      },
      context.requestUser.id,
    ),
  );
});

commentRoutes.patch("/pages/:id/comments/thread/unresolve", async (c) => {
  const context = await getPageForCommentRoute(c, "edit");

  if ("error" in context) {
    return context.error;
  }

  const body = await c.req.json().catch(() => ({})) as { threadId?: string };
  let thread: any = null;

  if (body.threadId) {
    const [t] = await db
      .select()
      .from(commentThread)
      .where(
        and(
          eq(commentThread.id, body.threadId),
          eq(commentThread.pageId, context.page.id),
          isNull(commentThread.deletedAt),
        ),
      )
      .limit(1);
    thread = t ?? null;
  } else {
    thread = await getActiveThread(context.page.id);
  }

  if (!thread) {
    return c.json({ error: "Comment thread not found" }, 404);
  }

  const now = new Date();

  await db
    .update(commentThread)
    .set({
      resolvedAt: null,
      resolvedById: null,
      updatedAt: now,
    })
    .where(eq(commentThread.id, thread.id));

  return c.json(
    await getThreadCommentsPayload(
      {
        ...thread,
        resolvedAt: null,
        resolvedById: null,
        updatedAt: now,
      },
      context.requestUser.id,
    ),
  );
});

commentRoutes.patch("/pages/:id/comments/:messageId", async (c) => {
  const context = await getPageForCommentRoute(c, "edit");

  if ("error" in context) {
    return context.error;
  }

  const messageId = c.req.param("messageId");

  if (!messageId) {
    return c.json({ error: "Comment not found" }, 404);
  }

  const messageContext = await getMessageContext(
    messageId,
    context.page.id,
  );

  if (!messageContext) {
    return c.json({ error: "Comment not found" }, 404);
  }

  if (
    messageContext.message.authorId !== context.requestUser.id &&
    !hasAccess(context.accessLevel, "full")
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const parsed = await readCommentBody(c);

  if ("error" in parsed) {
    return c.json({ error: parsed.error }, 400);
  }

  const now = new Date();

  await db
    .update(commentMessage)
    .set({ body: parsed.body, editedAt: now, updatedAt: now })
    .where(eq(commentMessage.id, messageContext.message.id));

  await db
    .update(commentThread)
    .set({ lastActivityAt: now, updatedAt: now })
    .where(eq(commentThread.id, messageContext.thread.id));

  return c.json(
    await getThreadCommentsPayload(
      messageContext.thread,
      context.requestUser.id,
    ),
  );
});

commentRoutes.post("/pages/:id/comments/:messageId/reactions", async (c) => {
  const context = await getPageForCommentRoute(c, "edit");

  if ("error" in context) {
    return context.error;
  }

  const messageId = c.req.param("messageId");

  if (!messageId) {
    return c.json({ error: "Comment not found" }, 404);
  }

  const messageContext = await getMessageContext(
    messageId,
    context.page.id,
  );

  if (!messageContext) {
    return c.json({ error: "Comment not found" }, 404);
  }

  const parsed = await readReactionEmoji(c);

  if ("error" in parsed) {
    return c.json({ error: parsed.error }, 400);
  }

  await db
    .insert(commentReaction)
    .values({
      id: crypto.randomUUID(),
      messageId: messageContext.message.id,
      userId: context.requestUser.id,
      emoji: parsed.emoji,
      createdAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        commentReaction.messageId,
        commentReaction.userId,
        commentReaction.emoji,
      ],
    });

  return c.json(
    await getThreadCommentsPayload(
      messageContext.thread,
      context.requestUser.id,
    ),
  );
});

commentRoutes.delete(
  "/pages/:id/comments/:messageId/reactions",
  async (c) => {
    const context = await getPageForCommentRoute(c, "edit");

    if ("error" in context) {
      return context.error;
    }

    const messageId = c.req.param("messageId");

    if (!messageId) {
      return c.json({ error: "Comment not found" }, 404);
    }

    const messageContext = await getMessageContext(
      messageId,
      context.page.id,
    );

    if (!messageContext) {
      return c.json({ error: "Comment not found" }, 404);
    }

    const parsed = await readReactionEmoji(c);

    if ("error" in parsed) {
      return c.json({ error: parsed.error }, 400);
    }

    await db
      .delete(commentReaction)
      .where(
        and(
          eq(commentReaction.messageId, messageContext.message.id),
          eq(commentReaction.userId, context.requestUser.id),
          eq(commentReaction.emoji, parsed.emoji),
        ),
      );

    return c.json(
      await getThreadCommentsPayload(
        messageContext.thread,
        context.requestUser.id,
      ),
    );
  },
);

commentRoutes.delete("/pages/:id/comments/:messageId", async (c) => {
  const context = await getPageForCommentRoute(c, "edit");

  if ("error" in context) {
    return context.error;
  }

  const messageId = c.req.param("messageId");

  if (!messageId) {
    return c.json({ error: "Comment not found" }, 404);
  }

  const messageContext = await getMessageContext(
    messageId,
    context.page.id,
  );

  if (!messageContext) {
    return c.json({ error: "Comment not found" }, 404);
  }

  if (
    messageContext.message.authorId !== context.requestUser.id &&
    !hasAccess(context.accessLevel, "full")
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const threadHasComments = await db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .delete(commentMessage)
      .where(eq(commentMessage.id, messageContext.message.id));

    const remainingMessages = await tx
      .select({ id: commentMessage.id })
      .from(commentMessage)
      .where(eq(commentMessage.threadId, messageContext.thread.id))
      .limit(1);

    if (remainingMessages.length === 0) {
      await tx
        .delete(commentThread)
        .where(eq(commentThread.id, messageContext.thread.id));
      return false;
    }

    await tx
      .update(commentThread)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(commentThread.id, messageContext.thread.id));

    return true;
  });

  return c.json(
    threadHasComments
      ? await getThreadCommentsPayload(
          messageContext.thread,
          context.requestUser.id,
        )
      : { comments: [], thread: null },
  );
});
