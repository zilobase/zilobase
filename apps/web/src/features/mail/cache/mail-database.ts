import Dexie, { type EntityTable } from "dexie"
import type {
  MailLabelRecord,
  MailMessageRecord,
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
