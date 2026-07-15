import type { Editor } from "@tiptap/core"
import * as Y from "yjs"

export const COMMENT_THREADS_FIELD = "commentThreads"
export const MAX_COMMENT_BODY_LENGTH = 10_000
export const MAX_REACTION_EMOJI_LENGTH = 32

export function createCommentDocument() {
  return new Y.Doc()
}

export function encodeCommentState(document: Y.Doc) {
  return Y.encodeStateAsUpdate(document)
}

export function applyCommentUpdate(document: Y.Doc, update: Uint8Array) {
  Y.applyUpdate(document, update)
}

export type CommentAuthorSnapshot = {
  email: string | null
  id: string
  image: string | null
  name: string | null
}

export type CommentReactionSnapshot = {
  count: number
  emoji: string
  reactedByMe: boolean
}

export type CommentMessageSnapshot = {
  author: CommentAuthorSnapshot
  authorId: string
  body: string
  createdAt: string
  editedAt: string | null
  id: string
  reactions: CommentReactionSnapshot[]
}

export type CommentThreadSnapshot = {
  anchorAttached: boolean
  comments: CommentMessageSnapshot[]
  createdAt: string
  createdBy: CommentAuthorSnapshot
  id: string
  kind: "block" | "inline" | "page"
  quote: string | null
  resolvedAt: string | null
  resolvedBy: CommentAuthorSnapshot | null
  updatedAt: string
}

export type PageCommentsSnapshot = {
  activeThreadId: string | null
  threads: CommentThreadSnapshot[]
}

export type PageCommentController = {
  activateThread: (threadId: string | null, options?: { openSidebar?: boolean }) => void
  addReaction: (threadId: string, messageId: string, emoji: string) => void
  canEdit: boolean
  canModerate: boolean
  createBlockThread: (body: string, range: { from: number; to: number }) => string | null
  createPageThread: (body: string) => string
  deleteMessage: (threadId: string, messageId: string) => void
  destroy: () => void
  editMessage: (threadId: string, messageId: string, body: string) => void
  getSnapshot: () => PageCommentsSnapshot
  removeReaction: (threadId: string, messageId: string, emoji: string) => void
  reply: (threadId: string, body: string) => string
  resolveThread: (threadId: string) => void
  setEditor: (editor: Editor | null) => void
  setOpenThreadHandler: (handler: ((threadId: string) => void) | null) => void
  subscribe: (listener: () => void) => () => void
  unresolveThread: (threadId: string) => void
  user: CommentAuthorSnapshot
}

type CreateControllerOptions = {
  canEdit: boolean
  canModerate: boolean
  document: Y.Doc
  user: CommentAuthorSnapshot
}

export function createPageCommentController({
  canEdit,
  canModerate,
  document,
  user,
}: CreateControllerOptions): PageCommentController {
  const threads = document.getMap<Y.Map<unknown>>(COMMENT_THREADS_FIELD)
  const listeners = new Set<() => void>()
  let activeThreadId: string | null = null
  let editor: Editor | null = null
  let openThreadHandler: ((threadId: string) => void) | null = null
  let snapshot = readSnapshot(threads, activeThreadId, editor, user.id)

  const emit = () => {
    snapshot = readSnapshot(threads, activeThreadId, editor, user.id)
    syncCommentAnchorDomState(editor, snapshot)
    listeners.forEach((listener) => listener())
  }

  const handleDocumentUpdate = () => emit()
  document.on("update", handleDocumentUpdate)

  const requireWritable = () => {
    if (!canEdit) throw new Error("Comments are read-only")
  }

  const getThread = (threadId: string) => {
    const thread = threads.get(threadId)
    if (!(thread instanceof Y.Map)) throw new Error("Comment thread not found")
    return thread
  }

  const appendMessage = (threadId: string, body: string) => {
    requireWritable()
    const value = normalizeCommentBody(body)
    const thread = getThread(threadId)
    const messages = getOrCreateMap<Y.Map<unknown>>(thread, "messages")
    const messageId = crypto.randomUUID()
    const now = new Date().toISOString()

    document.transact(() => {
      const message = new Y.Map<unknown>()
      message.set("id", messageId)
      message.set("author", user)
      message.set("body", value)
      message.set("createdAt", now)
      message.set("editedAt", null)
      message.set("reactions", new Y.Map())
      messages.set(messageId, message)
      thread.set("updatedAt", now)
    }, "comments")

    return messageId
  }

  const createThread = (
    kind: CommentThreadSnapshot["kind"],
    body: string,
    quote: string | null,
    applyAnchor?: (threadId: string) => void,
    options?: { openSidebar?: boolean },
  ) => {
    requireWritable()
    const value = normalizeCommentBody(body)
    const threadId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    const now = new Date().toISOString()

    document.transact(() => {
      const thread = new Y.Map<unknown>()
      const messages = new Y.Map<Y.Map<unknown>>()
      const message = new Y.Map<unknown>()

      message.set("id", messageId)
      message.set("author", user)
      message.set("body", value)
      message.set("createdAt", now)
      message.set("editedAt", null)
      message.set("reactions", new Y.Map())
      messages.set(messageId, message)

      thread.set("id", threadId)
      thread.set("kind", kind)
      thread.set("quote", quote)
      thread.set("rootMessageId", messageId)
      thread.set("createdBy", user)
      thread.set("createdAt", now)
      thread.set("updatedAt", now)
      thread.set("resolvedAt", null)
      thread.set("resolvedBy", null)
      thread.set("messages", messages)
      threads.set(threadId, thread)

      applyAnchor?.(threadId)
    }, "comments")

    activeThreadId = threadId
    emit()
    if (options?.openSidebar !== false) openThreadHandler?.(threadId)
    return threadId
  }

  const controller: PageCommentController = {
    canEdit,
    canModerate,
    user,
    activateThread(threadId, options) {
      activeThreadId = threadId

      if (threadId && editor && !editor.isDestroyed) {
        const range = findCommentRange(editor, threadId)
        if (range) {
          editor.commands.setTextSelection(range)
          editor.commands.scrollIntoView()
          editor.view.focus()
        }
      }

      emit()
      if (threadId && options?.openSidebar !== false) openThreadHandler?.(threadId)
    },
    addReaction(threadId, messageId, emoji) {
      requireWritable()
      const value = normalizeReactionEmoji(emoji)
      const thread = getThread(threadId)
      const message = getMessage(thread, messageId)
      const reactions = getOrCreateMap<unknown>(message, "reactions")
      const now = new Date().toISOString()
      document.transact(() => {
        reactions.set(reactionKey(user.id, value), {
          createdAt: now,
          emoji: value,
          userId: user.id,
        })
        thread.set("updatedAt", now)
      }, "comments")
    },
    createBlockThread(body, range) {
      if (!editor || editor.isDestroyed) return null

      const from = Math.max(0, Math.min(range.from, editor.state.doc.content.size))
      const to = Math.max(from, Math.min(range.to, editor.state.doc.content.size))
      const quote = editor.state.doc.textBetween(from, to, " ").trim()
      const commentMark = editor.schema.marks.comment
      if (!quote || !commentMark) return null

      return createThread("block", body, quote, (threadId) => {
        if (!editor || editor.isDestroyed) return
        editor.view.dispatch(
          editor.state.tr.addMark(
            from,
            to,
            commentMark.create({ commentId: threadId, commentKind: "block" }),
          ),
        )
      }, { openSidebar: false })
    },
    createPageThread(body) {
      return createThread("page", body, null) as string
    },
    deleteMessage(threadId, messageId) {
      requireWritable()
      const thread = getThread(threadId)
      const messages = getOrCreateMap<Y.Map<unknown>>(thread, "messages")
      const message = messages.get(messageId)
      if (!message) return
      const author = readAuthor(message.get("author"))
      if (author.id !== user.id && !canModerate) throw new Error("Forbidden")
      const deleteEntireThread = getRootMessageId(thread, messages) === messageId

      document.transact(() => {
        if (deleteEntireThread) {
          threads.delete(threadId)
          editor?.commands.unsetComment(threadId)
          if (activeThreadId === threadId) activeThreadId = null
        } else {
          messages.delete(messageId)
          thread.set("updatedAt", new Date().toISOString())
        }
      }, "comments")
    },
    destroy() {
      document.off("update", handleDocumentUpdate)
      listeners.clear()
      editor = null
      openThreadHandler = null
    },
    editMessage(threadId, messageId, body) {
      requireWritable()
      const value = normalizeCommentBody(body)
      const thread = getThread(threadId)
      const message = getMessage(thread, messageId)
      const author = readAuthor(message.get("author"))
      if (author.id !== user.id && !canModerate) throw new Error("Forbidden")
      const now = new Date().toISOString()
      document.transact(() => {
        message.set("body", value)
        message.set("editedAt", now)
        thread.set("updatedAt", now)
      }, "comments")
    },
    getSnapshot: () => snapshot,
    removeReaction(threadId, messageId, emoji) {
      requireWritable()
      const thread = getThread(threadId)
      const message = getMessage(thread, messageId)
      const reactions = getOrCreateMap<unknown>(message, "reactions")
      document.transact(() => {
        reactions.delete(reactionKey(user.id, normalizeReactionEmoji(emoji)))
        thread.set("updatedAt", new Date().toISOString())
      }, "comments")
    },
    reply: appendMessage,
    resolveThread(threadId) {
      requireWritable()
      const thread = getThread(threadId)
      const now = new Date().toISOString()
      document.transact(() => {
        thread.set("resolvedAt", now)
        thread.set("resolvedBy", user)
        thread.set("updatedAt", now)
      }, "comments")
    },
    setEditor(nextEditor) {
      editor = nextEditor
      emit()
    },
    setOpenThreadHandler(handler) {
      openThreadHandler = handler
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    unresolveThread(threadId) {
      requireWritable()
      const thread = getThread(threadId)
      document.transact(() => {
        thread.set("resolvedAt", null)
        thread.set("resolvedBy", null)
        thread.set("updatedAt", new Date().toISOString())
      }, "comments")
    },
  }

  return controller
}

function readSnapshot(
  threads: Y.Map<Y.Map<unknown>>,
  activeThreadId: string | null,
  editor: Editor | null,
  currentUserId: string,
): PageCommentsSnapshot {
  const items = [...threads.entries()].flatMap(([id, value]) => {
    if (!(value instanceof Y.Map)) return []
    const messagesValue = value.get("messages")
    const comments = messagesValue instanceof Y.Map
      ? [...messagesValue.entries()].flatMap(([messageId, message]) =>
          message instanceof Y.Map
            ? [readMessage(messageId, message, currentUserId)]
            : [],
        ).sort(compareCreated)
      : []
    const storedKind = value.get("kind")
    const kind = storedKind === "block" || storedKind === "inline"
      ? storedKind
      : "page"
    const createdAt = readString(value.get("createdAt"))
    const updatedAt = readString(value.get("updatedAt")) || createdAt

    return [{
      anchorAttached: kind === "page" || Boolean(editor && findCommentRange(editor, id)),
      comments,
      createdAt,
      createdBy: readAuthor(value.get("createdBy")),
      id,
      kind,
      quote: readNullableString(value.get("quote")),
      resolvedAt: readNullableString(value.get("resolvedAt")),
      resolvedBy: value.get("resolvedBy") ? readAuthor(value.get("resolvedBy")) : null,
      updatedAt,
    } satisfies CommentThreadSnapshot]
  })

  items.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
  )
  return { activeThreadId, threads: items }
}

function readMessage(
  id: string,
  message: Y.Map<unknown>,
  currentUserId: string,
): CommentMessageSnapshot {
  const author = readAuthor(message.get("author"))
  const reactionCounts = new Map<string, { count: number; reactedByMe: boolean }>()
  const reactions = message.get("reactions")
  if (reactions instanceof Y.Map) {
    for (const value of reactions.values()) {
      if (!value || typeof value !== "object") continue
      const record = value as Record<string, unknown>
      const emoji = readString(record.emoji)
      const userId = readString(record.userId)
      if (!emoji || !userId) continue
      const current = reactionCounts.get(emoji) ?? { count: 0, reactedByMe: false }
      reactionCounts.set(emoji, {
        count: current.count + 1,
        reactedByMe: current.reactedByMe || userId === currentUserId,
      })
    }
  }

  return {
    author,
    authorId: author.id,
    body: readString(message.get("body")),
    createdAt: readString(message.get("createdAt")),
    editedAt: readNullableString(message.get("editedAt")),
    id,
    reactions: [...reactionCounts.entries()].map(([emoji, reaction]) => ({
      emoji,
      ...reaction,
    })),
  }
}

function getMessage(thread: Y.Map<unknown>, messageId: string) {
  const message = getOrCreateMap<Y.Map<unknown>>(thread, "messages").get(messageId)
  if (!(message instanceof Y.Map)) throw new Error("Comment not found")
  return message
}

function getRootMessageId(
  thread: Y.Map<unknown>,
  messages: Y.Map<Y.Map<unknown>>,
) {
  const storedRootMessageId = readString(thread.get("rootMessageId"))
  if (storedRootMessageId && messages.has(storedRootMessageId)) {
    return storedRootMessageId
  }

  let root: { createdAt: string; id: string } | null = null
  for (const [id, message] of messages.entries()) {
    if (!(message instanceof Y.Map)) continue
    const createdAt = readString(message.get("createdAt"))
    if (
      !root ||
      createdAt < root.createdAt ||
      (createdAt === root.createdAt && id < root.id)
    ) {
      root = { createdAt, id }
    }
  }
  return root?.id ?? null
}

function getOrCreateMap<T>(parent: Y.Map<unknown>, key: string): Y.Map<T> {
  const existing = parent.get(key)
  if (existing instanceof Y.Map) return existing as Y.Map<T>
  const created = new Y.Map<T>()
  parent.set(key, created)
  return created
}

function findCommentRange(editor: Editor, threadId: string) {
  let range: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, position) => {
    if (range) return false
    const mark = node.marks.find(
      (item) => item.type.name === "comment" && item.attrs.commentId === threadId,
    )
    if (mark) range = { from: position, to: position + node.nodeSize }
    return !range
  })
  return range
}

function syncCommentAnchorDomState(editor: Editor | null, snapshot: PageCommentsSnapshot) {
  if (!editor || editor.isDestroyed) return
  const threadById = new Map(snapshot.threads.map((thread) => [thread.id, thread]))
  editor.view.dom.querySelectorAll<HTMLElement>("span[data-comment-id]").forEach((element) => {
    const id = element.dataset.commentId ?? ""
    const thread = threadById.get(id)
    element.dataset.commentActive = id === snapshot.activeThreadId ? "true" : "false"
    element.dataset.commentKind = thread?.kind ?? ""
    element.dataset.commentResolved = thread?.resolvedAt ? "true" : "false"
  })
}

function normalizeCommentBody(body: string) {
  const value = body.trim()
  if (!value) throw new Error("Comment body is required")
  if (value.length > MAX_COMMENT_BODY_LENGTH) throw new Error("Comment is too long")
  return value
}

function normalizeReactionEmoji(emoji: string) {
  const value = emoji.trim()
  if (!value || value.length > MAX_REACTION_EMOJI_LENGTH) throw new Error("Invalid reaction")
  return value
}

function reactionKey(userId: string, emoji: string) {
  return `${encodeURIComponent(userId)}:${encodeURIComponent(emoji)}`
}

function readAuthor(value: unknown): CommentAuthorSnapshot {
  const author = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    email: readNullableString(author.email),
    id: readString(author.id),
    image: readNullableString(author.image),
    name: readNullableString(author.name),
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function compareCreated(left: CommentMessageSnapshot, right: CommentMessageSnapshot) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
}
