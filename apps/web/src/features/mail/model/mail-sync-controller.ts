import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import type {
  MailConnection,
  MailMessageRecord,
  MailSyncRequest,
  MailSyncResponse,
  MailThreadSummary,
  MailView,
} from "@zilobase/features/mail"

import { apiFetch, getApiRequestHeaders, toApiUrl } from "@/features/desktop/network/api"
import { desktopNetworkFetch } from "@/features/desktop/network"
import { getConnectivityState, subscribeConnectivity } from "@/features/offline/model"
import {
  applyMailSyncResponse,
  closeMailDatabase,
  mailDatabaseName,
  openMailDatabase,
  upsertFullMailThread,
  type MailDatabase,
} from "../cache/mail-database"

export function useMailController(input: {
  connection: MailConnection
  query: string
  userId: string
  view: MailView
}) {
  const [database, setDatabase] = useState<MailDatabase | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null)
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => getConnectivityState() === "online",
    () => true,
  )

  useEffect(() => {
    if (!input.connection.connectionId) return
    setDatabase(null)
    const identity = {
      apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin,
      connectionId: input.connection.connectionId,
      userId: input.userId,
    }
    let active = true
    void openMailDatabase(identity).then((next) => {
      if (active) setDatabase(next)
      else closeMailDatabase(mailDatabaseName(identity))
    }).catch(setError)
    return () => {
      active = false
      closeMailDatabase(mailDatabaseName(identity))
    }
  }, [input.connection.connectionId, input.userId])

  const cachedThreads = useLiveQuery(
    () => database ? database.threads.orderBy("internalDate").reverse().toArray() : [],
    [database],
    [],
  )
  const syncState = useLiveQuery(
    () => database?.syncState.get("primary"),
    [database],
    undefined,
  )

  const runSync = useCallback(async (options: { loadMore?: boolean; search?: string } = {}) => {
    if (!database || !input.connection.connectionId || !online) return null
    setSyncing(true)
    setError(null)
    try {
      const state = await database.syncState.get("primary")
      const isSearch = Boolean(options.search?.trim())
      const loaded = state?.loadedViews?.[input.view] === true
      const request: MailSyncRequest = {
        connectionId: input.connection.connectionId,
        historyId: !options.loadMore && !isSearch && loaded ? state?.historyId ?? undefined : undefined,
        pageToken: options.loadMore ? state?.pageTokens[input.view] : undefined,
        query: isSearch ? options.search!.trim() : undefined,
        view: input.view,
      }
      if (request.historyId) {
        const [messages, threads] = await Promise.all([
          database.messages.toCollection().primaryKeys(),
          database.threads.toCollection().primaryKeys(),
        ])
        request.knownMessageIds = messages.map(String)
        request.knownThreadIds = threads.map(String)
      }
      const response = await apiFetch<MailSyncResponse>("/mail/sync", {
        body: JSON.stringify(request),
        method: "POST",
      })
      await applyMailSyncResponse(database, response, input.view, { markViewLoaded: !isSearch })
      setSearchResultIds(isSearch ? response.threads.map((thread) => thread.id) : null)
      return response
    } catch (syncError) {
      setError(syncError)
      return null
    } finally {
      setSyncing(false)
    }
  }, [database, input.connection.connectionId, input.view, online])

  useEffect(() => {
    if (!database || !online) return
    const timer = window.setTimeout(() => void runSync(), 0)
    return () => window.clearTimeout(timer)
  }, [database, input.view, online, runSync])

  useEffect(() => {
    if (!database) return
    const search = input.query.trim()
    if (!search || !online) {
      setSearchResultIds(null)
      return
    }
    const timer = window.setTimeout(() => void runSync({ search }), 350)
    return () => window.clearTimeout(timer)
  }, [database, input.query, online, runSync])

  const threads = useMemo(() => {
    const visible = (cachedThreads ?? []).filter((thread) => threadMatchesView(thread, input.view))
    if (searchResultIds) {
      const order = new Map(searchResultIds.map((id, index) => [id, index]))
      return visible.filter((thread) => order.has(thread.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    }
    const query = input.query.trim().toLowerCase()
    if (!query) return visible
    return visible.filter((thread) => [
      thread.subject,
      thread.snippet,
      ...thread.participants.flatMap((participant) => [participant.name ?? "", participant.address]),
    ].some((value) => value.toLowerCase().includes(query)))
  }, [cachedThreads, input.query, input.view, searchResultIds])

  const openThread = useCallback(async (threadId: string) => {
    if (!database) return
    const cached = await database.messages.where("threadId").equals(threadId).toArray()
    if (!online || (cached.length > 0 && cached.every((message) => message.hasFullBody))) return
    try {
      const response = await apiFetch<{ messages: MailMessageRecord[]; thread: MailThreadSummary }>(
        `/mail/threads/${encodeURIComponent(threadId)}`,
      )
      await upsertFullMailThread(database, response)
    } catch (threadError) {
      setError(threadError)
    }
  }, [database, online])

  const downloadAttachment = useCallback(async (messageId: string, attachmentId: string, filename: string) => {
    if (!online) throw new Error("Reconnect to download attachments.")
    const response = await desktopNetworkFetch(
      toApiUrl(`/mail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`),
      { credentials: "include", headers: getApiRequestHeaders() },
    )
    if (!response.ok) throw new Error("The attachment could not be downloaded.")
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [online])

  return {
    database,
    downloadAttachment,
    error,
    hasMore: Boolean(syncState?.pageTokens[input.view]),
    online,
    openThread,
    refresh: runSync,
    loadMore: () => runSync({ loadMore: true }),
    syncing,
    threads,
  }
}

export function threadMatchesView(thread: MailThreadSummary, view: MailView) {
  switch (view) {
    case "archive": return !["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"].some((label) => thread.labelIds.includes(label))
    case "drafts": return thread.labelIds.includes("DRAFT")
    case "inbox": return thread.labelIds.includes("INBOX")
    case "sent": return thread.labelIds.includes("SENT")
    case "spam": return thread.labelIds.includes("SPAM")
    case "starred": return thread.starred
    case "trash": return thread.labelIds.includes("TRASH")
    case "unread": return thread.unread
  }
}
