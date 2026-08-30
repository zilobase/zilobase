import assert from "node:assert/strict"
import { test } from "vitest"

import { GmailApiError, type GmailMessage, type GmailThread } from "./gmail-gateway"
import { synchronizeMailbox, viewFilter } from "./mail-sync"

test("full synchronization loads 50-thread pages, metadata, labels, profile cursor, and search", async () => {
  const calls: unknown[] = []
  const gateway = fakeGateway({
    listThreads: async (input: { labelIds?: string[]; maxResults?: number; pageToken?: string; query?: string }) => {
      calls.push(input)
      return { nextPageToken: "next-page", threads: [{ id: "thread-1" }] }
    },
  })
  const result = await synchronizeMailbox(gateway, {
    connectionId: "connection-1",
    query: "from:ada@example.com",
    view: "inbox",
  }, 7)

  assert.deepEqual(calls, [{ labelIds: ["INBOX"], maxResults: 50, pageToken: undefined, query: "from:ada@example.com" }])
  assert.equal(result.mode, "full")
  assert.equal(result.historyId, "200")
  assert.equal(result.nextPageToken, "next-page")
  assert.equal(result.threads[0]?.id, "thread-1")
  assert.equal(result.messages[0]?.hasFullBody, false)
  assert.equal(result.mailboxRevision, 7)
})

test("incremental synchronization walks every history page and returns upserts and deletions", async () => {
  let page = 0
  const gateway = fakeGateway({
    getThread: async (id: string) => {
      if (id === "deleted-thread") throw new GmailApiError("missing", 404, "provider_error")
      return fixtureThread(id)
    },
    listHistory: async () => {
      page += 1
      return page === 1
        ? {
            history: [{ messagesAdded: [{ message: { id: "new-message", threadId: "thread-2" } }] }],
            historyId: "201",
            nextPageToken: "page-2",
          }
        : {
            history: [{ messagesDeleted: [{ message: { id: "gone-message", threadId: "deleted-thread" } }] }],
            historyId: "202",
          }
    },
  })
  const result = await synchronizeMailbox(gateway, {
    connectionId: "connection-1",
    historyId: "200",
    view: "inbox",
  }, 8)

  assert.equal(page, 2)
  assert.equal(result.mode, "incremental")
  assert.equal(result.historyId, "202")
  assert.deepEqual(result.deletedMessageIds, ["gone-message"])
  assert.deepEqual(result.deletedThreadIds, ["deleted-thread"])
  assert.equal(result.threads[0]?.id, "thread-2")
})

test("expired history recovers the visible folder and validates known cache IDs", async () => {
  const gateway = fakeGateway({
    listHistory: async () => {
      throw new GmailApiError("expired", 409, "history_cursor_invalid")
    },
  })
  const result = await synchronizeMailbox(gateway, {
    connectionId: "connection-1",
    historyId: "old",
    knownMessageIds: ["message-thread-1", "stale-message"],
    knownThreadIds: ["thread-1", "stale-thread"],
    view: "inbox",
  }, 9)

  assert.equal(result.mode, "recovery")
  assert.deepEqual(result.deletedMessageIds, ["stale-message"])
  assert.deepEqual(result.deletedThreadIds, ["stale-thread"])
  assert.equal(result.historyId, "200")
})

test("all supported folders map to Gmail system labels or an archive query", () => {
  assert.deepEqual(viewFilter("unread"), { labelIds: ["UNREAD"] })
  assert.deepEqual(viewFilter("sent"), { labelIds: ["SENT"] })
  assert.match(viewFilter("archive").query ?? "", /-in:inbox/)
})

function fakeGateway(overrides: Record<string, unknown> = {}) {
  return {
    getProfile: async () => ({ historyId: "200" }),
    getThread: async (id: string) => fixtureThread(id),
    getThreads: async (ids: string[]) => ids.map(fixtureThread),
    listHistory: async () => ({ historyId: "200" }),
    listLabels: async () => ({ labels: [{ id: "INBOX", name: "Inbox", type: "system" }] }),
    listThreads: async () => ({ threads: [{ id: "thread-1" }] }),
    ...overrides,
  } as Parameters<typeof synchronizeMailbox>[0]
}

function fixtureThread(id: string): GmailThread {
  return {
    historyId: "199",
    id,
    messages: [fixtureMessage(`message-${id}`, id)],
  }
}

function fixtureMessage(id: string, threadId: string): GmailMessage {
  return {
    historyId: "199",
    id,
    internalDate: "100",
    labelIds: ["INBOX"],
    payload: { headers: [{ name: "Subject", value: "Fixture" }] },
    snippet: "Fixture",
    threadId,
  }
}
