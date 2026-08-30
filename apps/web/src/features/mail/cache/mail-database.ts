import Dexie, { type EntityTable } from "dexie"
import type {
  MailLabelRecord,
  MailMessageRecord,
  MailModifyRequest,
  MailSyncResponse,
  MailThreadSummary,
  MailView,
} from "@zilobase/features/mail"

const MAIL_DATABASE_VERSION = 2
const openDatabases = new Map<string, MailDatabase>()

export type MailSyncStateRecord = {
  connectionId: string
  historyId: string | null
  key: "primary"
  lastSyncedAt: number | null
  loadedViews?: Partial<Record<MailView, boolean>>
  mailboxRevision: number
  pendingMessageReconciliationIds?: string[]
  pendingThreadReconciliationIds?: string[]
  pageTokens: Partial<Record<MailView, string>>
  schemaVersion: number
  userId: string
}

export class MailDatabase extends Dexie {
  labels!: EntityTable<MailLabelRecord, "id">
  messages!: EntityTable<MailMessageRecord, "id">
  syncState!: EntityTable<MailSyncStateRecord, "key">
  threads!: EntityTable<MailThreadSummary, "id">

  constructor(
    name: string,
    readonly identity: { connectionId: string; userId: string },
  ) {
    super(name)
    this.version(MAIL_DATABASE_VERSION).stores({
      labels: "id, name, type",
      messages:
        "id, threadId, draftId, date, internalDate, *labelIds, [threadId+internalDate]",
      syncState: "key, connectionId, userId",
      threads: "id, internalDate, latestMessageId, unread, starred, *labelIds",
    }).upgrade((transaction) => transaction.table("syncState").toCollection().modify({
      schemaVersion: MAIL_DATABASE_VERSION,
    }))
  }
}

export function mailDatabaseName(input: {
  apiOrigin: string
  connectionId: string
  userId: string
}) {
  const origin = new URL(input.apiOrigin).origin
  const userId = requireIdentifier(input.userId, "user")
  const connectionId = requireIdentifier(input.connectionId, "connection")
  return `zilobase:v1:${encodeURIComponent(origin)}:${encodeURIComponent(userId)}:mail:${encodeURIComponent(connectionId)}`
}

export async function openMailDatabase(input: {
  apiOrigin: string
  connectionId: string
  userId: string
}) {
  const name = mailDatabaseName(input)
  let database = openDatabases.get(name)
  if (!database) {
    database = new MailDatabase(name, {
      connectionId: input.connectionId,
      userId: input.userId,
    })
    openDatabases.set(name, database)
  }

  await database.open()
  const state = await database.syncState.get("primary")
  if (
    state &&
    (state.schemaVersion !== MAIL_DATABASE_VERSION ||
      state.connectionId !== input.connectionId ||
      state.userId !== input.userId)
  ) {
    database.close()
    openDatabases.delete(name)
    await Dexie.delete(name)
    return openMailDatabase(input)
  }

  if (!state) {
    await database.syncState.put({
      connectionId: input.connectionId,
      historyId: null,
      key: "primary",
      lastSyncedAt: null,
      loadedViews: {},
      mailboxRevision: 0,
      pageTokens: {},
      schemaVersion: MAIL_DATABASE_VERSION,
      userId: input.userId,
    })
  }

  return database
}

export async function applyMailSyncResponse(
  database: MailDatabase,
  response: MailSyncResponse,
  view: MailView,
  options: { markViewLoaded?: boolean } = {},
) {
  await database.transaction(
    "rw",
    database.labels,
    database.messages,
    database.syncState,
    database.threads,
    async () => {
      if (response.labels.length) await database.labels.bulkPut(response.labels)
      if (response.messages.length) await mergeMessages(database, response.messages)
      if (response.threads.length) await database.threads.bulkPut(response.threads)
      if (response.deletedMessageIds.length) {
        await database.messages.bulkDelete(response.deletedMessageIds)
      }
      if (response.deletedThreadIds.length) {
        await database.threads.bulkDelete(response.deletedThreadIds)
      }

      const current = await database.syncState.get("primary")
      if (!current) throw new Error("Mail cache identity is missing.")
      await database.syncState.put({
        ...current,
        historyId: response.historyId,
        lastSyncedAt: Date.now(),
        loadedViews: options.markViewLoaded === false
          ? current.loadedViews
          : { ...current.loadedViews, [view]: true },
        mailboxRevision: response.mailboxRevision,
        pageTokens: {
          ...current.pageTokens,
          [view]: response.nextPageToken ?? undefined,
        },
      })
    },
  )
}

export async function upsertFullMailThread(
  database: MailDatabase,
  input: { messages: MailMessageRecord[]; thread: MailThreadSummary },
) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    await mergeMessages(database, input.messages)
    await database.threads.put(input.thread)
  })
}

export type MailMutationSnapshot = {
  messages: MailMessageRecord[]
  thread: MailThreadSummary
}

export async function optimisticallyModifyThread(
  database: MailDatabase,
  threadId: string,
  modification: MailModifyRequest,
) {
  return database.transaction("rw", database.messages, database.threads, async () => {
    const thread = await database.threads.get(threadId)
    if (!thread) throw new Error("The cached Gmail thread is unavailable.")
    const messages = await database.messages.where("threadId").equals(threadId).toArray()
    await database.messages.bulkPut(messages.map((message) => ({
      ...message,
      labelIds: modifyLabelIds(message.labelIds, modification),
    })))
    await database.threads.put(updateThreadLabels(thread, modification))
    return { messages, thread } satisfies MailMutationSnapshot
  })
}

export async function optimisticallyModifyMessage(
  database: MailDatabase,
  messageId: string,
  modification: MailModifyRequest,
) {
  return database.transaction("rw", database.messages, database.threads, async () => {
    const message = await database.messages.get(messageId)
    if (!message) throw new Error("The cached Gmail message is unavailable.")
    const thread = await database.threads.get(message.threadId)
    if (!thread) throw new Error("The cached Gmail thread is unavailable.")
    const messages = await database.messages.where("threadId").equals(message.threadId).toArray()
    const updatedMessages = messages.map((item) => item.id === messageId
      ? { ...item, labelIds: modifyLabelIds(item.labelIds, modification) }
      : item)
    await database.messages.bulkPut(updatedMessages)
    await database.threads.put(recalculateThreadLabels(thread, updatedMessages))
    return { messages, thread } satisfies MailMutationSnapshot
  })
}

export async function restoreMailMutation(
  database: MailDatabase,
  snapshot: MailMutationSnapshot,
) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    await database.messages.bulkPut(snapshot.messages)
    await database.threads.put(snapshot.thread)
  })
}

export async function reconcileMailMessage(
  database: MailDatabase,
  message: MailMessageRecord,
) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    await mergeMessages(database, [message])
    const thread = await database.threads.get(message.threadId)
    if (!thread) return
    const messages = await database.messages.where("threadId").equals(message.threadId).toArray()
    await database.threads.put(recalculateThreadLabels(thread, messages))
  })
}

export async function deleteMailLabelFromCache(database: MailDatabase, labelId: string) {
  await database.transaction("rw", database.labels, database.messages, database.threads, async () => {
    await database.labels.delete(labelId)
    await database.messages.where("labelIds").equals(labelId).modify((message) => {
      message.labelIds = message.labelIds.filter((id) => id !== labelId)
    })
    await database.threads.where("labelIds").equals(labelId).modify((thread) => {
      thread.labelIds = thread.labelIds.filter((id) => id !== labelId)
    })
  })
}

export async function deleteMailThreadFromCache(database: MailDatabase, threadId: string) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    await database.messages.where("threadId").equals(threadId).delete()
    await database.threads.delete(threadId)
  })
}

export async function deleteMailMessageFromCache(database: MailDatabase, messageId: string) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    const message = await database.messages.get(messageId)
    if (!message) return
    await database.messages.delete(messageId)
    const thread = await database.threads.get(message.threadId)
    if (!thread) return
    const messages = await database.messages.where("threadId").equals(message.threadId).toArray()
    if (!messages.length) await database.threads.delete(message.threadId)
    else await database.threads.put(recalculateThreadLabels(thread, messages))
  })
}

export async function queueMailReconciliation(
  database: MailDatabase,
  input: { messageIds?: string[]; threadIds?: string[] },
) {
  await database.transaction("rw", database.syncState, async () => {
    const state = await database.syncState.get("primary")
    if (!state) throw new Error("Mail cache identity is missing.")
    await database.syncState.put({
      ...state,
      pendingMessageReconciliationIds: uniqueLimited([
        ...(state.pendingMessageReconciliationIds ?? []),
        ...(input.messageIds ?? []),
      ]),
      pendingThreadReconciliationIds: uniqueLimited([
        ...(state.pendingThreadReconciliationIds ?? []),
        ...(input.threadIds ?? []),
      ]),
    })
  })
}

export async function clearMailReconciliation(
  database: MailDatabase,
  input: { messageId?: string; threadId?: string },
) {
  await database.transaction("rw", database.syncState, async () => {
    const state = await database.syncState.get("primary")
    if (!state) return
    await database.syncState.put({
      ...state,
      pendingMessageReconciliationIds: state.pendingMessageReconciliationIds?.filter((id) => id !== input.messageId),
      pendingThreadReconciliationIds: state.pendingThreadReconciliationIds?.filter((id) => id !== input.threadId),
    })
  })
}

async function mergeMessages(
  database: MailDatabase,
  messages: MailMessageRecord[],
) {
  const existing = await database.messages.bulkGet(
    messages.map((message) => message.id),
  )
  await database.messages.bulkPut(
    messages.map((message, index) => {
      const cached = existing[index]
      if (!cached?.hasFullBody || message.hasFullBody) return message
      return {
        ...message,
        attachments: cached.attachments,
        attachmentCount: cached.attachmentCount,
        bodyHtml: cached.bodyHtml,
        bodyText: cached.bodyText,
        hasFullBody: true,
      }
    }),
  )
}

export function modifyLabelIds(labelIds: string[], modification: MailModifyRequest) {
  const next = new Set(labelIds)
  for (const id of modification.removeLabelIds ?? []) next.delete(id)
  for (const id of modification.addLabelIds ?? []) next.add(id)
  return [...next]
}

function updateThreadLabels(thread: MailThreadSummary, modification: MailModifyRequest) {
  const labelIds = modifyLabelIds(thread.labelIds, modification)
  return {
    ...thread,
    labelIds,
    starred: labelIds.includes("STARRED"),
    unread: labelIds.includes("UNREAD"),
  }
}

function recalculateThreadLabels(thread: MailThreadSummary, messages: MailMessageRecord[]) {
  const labelIds = [...new Set(messages.flatMap((message) => message.labelIds))]
  return {
    ...thread,
    labelIds,
    starred: messages.some((message) => message.labelIds.includes("STARRED")),
    unread: messages.some((message) => message.labelIds.includes("UNREAD")),
  }
}

export function closeMailDatabase(name: string) {
  const database = openDatabases.get(name)
  database?.close()
  openDatabases.delete(name)
}

export async function destroyMailDatabase(name: string) {
  closeMailDatabase(name)
  await Dexie.delete(name)
}

export async function destroyMailDatabasesForPrefix(prefix: string) {
  const names = await Dexie.getDatabaseNames()
  await Promise.all(
    names.filter((name) => name.startsWith(prefix)).map(destroyMailDatabase),
  )
}

function requireIdentifier(value: string, kind: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 512) {
    throw new Error(`A valid mail ${kind} identifier is required.`)
  }
  return normalized
}

function uniqueLimited(values: string[]) {
  return [...new Set(values)].slice(-100)
}
