import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import type {
  MailFilterExpression,
  MailConnection,
  MailLabelRecord,
  MailLabelWriteRequest,
  MailMessageRecord,
  MailMessageMutationResponse,
  MailModifyRequest,
  MailSyncRequest,
  MailSyncResponse,
  MailThreadSummary,
  MailThreadMutationResponse,
  MailView,
} from "@zilobase/features/mail"
import {
  evaluateMailFilterExpression,
  mailFilterRecordFromThreadSummary,
} from "@zilobase/features/mail"

import { ApiError, apiFetch, getApiRequestHeaders, toApiUrl } from "@/features/desktop/network/api"
import { desktopNetworkFetch } from "@/features/desktop/network"
import { describeDesktopError, recordDesktopDiagnostic } from "@/features/desktop/diagnostics/index"
import { getConnectivityState, subscribeConnectivity } from "@/features/offline/model"
import {
  applyMailSyncResponse,
  clearMailReconciliation,
  deleteMailLabelFromCache,
  deleteMailMessageFromCache,
  deleteMailThreadFromCache,
  openMailDatabase,
  optimisticallyModifyMessage,
  optimisticallyModifyThread,
  queueMailReconciliation,
  reconcileMailMessage,
  restoreMailMutation,
  upsertFullMailThread,
  type MailDatabase,
} from "../cache/mail-database"
import { safeMailDownloadFilename } from "./mail-attachment"
import { loadMailThreadOnce } from "./mail-thread-loader"
import { mailApiBasePath } from "./mail-api-path"

export function useMailController(input: {
  connection: MailConnection
  filter?: MailFilterExpression | null
  query: string
  userId: string
  view: MailView
}) {
  const mailBasePath = mailApiBasePath(input.connection.workspaceId)
  const [database, setDatabase] = useState<MailDatabase | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null)
  const threadLoads = useRef(new Map<string, Promise<void>>())
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => getConnectivityState() === "online",
    () => true,
  )

  useEffect(() => {
    if (!input.connection.connectionId || !input.connection.bindingId || !input.connection.workspaceId) return
    setDatabase(null)
    const identity = {
      apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin,
      bindingId: input.connection.bindingId,
      connectionId: input.connection.connectionId,
      userId: input.userId,
      workspaceId: input.connection.workspaceId,
    }
    let active = true
    void openMailDatabase(identity).then((next) => {
      if (!active) return
      setError(null)
      setDatabase(next)
    }).catch((cacheError) => {
      if (!active) return
      recordDesktopDiagnostic("mail.cache_failure", describeDesktopError(cacheError), "error")
      setError(cacheError)
    })
    return () => {
      // This cleanup only cancels this React consumer. Explicit lifecycle events
      // such as disconnect, logout, and server replacement own cache closure.
      active = false
    }
  }, [
    input.connection.bindingId,
    input.connection.connectionId,
    input.connection.workspaceId,
    input.userId,
  ])

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
  const labels = useLiveQuery(
    () => database ? database.labels.orderBy("name").toArray() : [],
    [database],
    [],
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
      const response = await apiFetch<MailSyncResponse>(`${mailBasePath}/sync`, {
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
    const visible = (cachedThreads ?? []).filter((thread) => input.filter
      ? evaluateMailFilterExpression(mailFilterRecordFromThreadSummary(thread), input.filter)
      : threadMatchesView(thread, input.view))
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
  }, [cachedThreads, input.filter, input.query, input.view, searchResultIds])

  const loadThread = useCallback((threadId: string) => {
    if (!database) return
    const key = `${database.name}:${threadId}`
    return loadMailThreadOnce(threadLoads.current, key, async () => {
      const cached = await database.messages.where("threadId").equals(threadId).toArray()
      if (!online || (cached.length > 0 && cached.every((message) => message.hasFullBody))) return
      const response = await apiFetch<{ messages: MailMessageRecord[]; thread: MailThreadSummary }>(
        `${mailBasePath}/threads/${encodeURIComponent(threadId)}`,
      )
      await upsertFullMailThread(database, response)
    })
  }, [database, online])

  const openThread = useCallback(async (threadId: string) => {
    try {
      await loadThread(threadId)
    } catch (threadError) {
      setError(threadError)
    }
  }, [loadThread])

  const prefetchThread = useCallback(async (threadId: string) => {
    try {
      await loadThread(threadId)
    } catch {
      // Intent prefetch is opportunistic; a foreground open retries and reports failures.
    }
  }, [loadThread])

  const downloadAttachment = useCallback(async (messageId: string, attachmentId: string, filename: string) => {
    if (!online) throw new Error("Reconnect to download attachments.")
    const blob = await fetchAttachmentBlob(messageId, attachmentId)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = safeMailDownloadFilename(filename)
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [online])

  const loadInlineAttachment = useCallback(async (messageId: string, attachmentId: string) => {
    if (!online) throw new Error("Reconnect to load inline images.")
    return URL.createObjectURL(await fetchAttachmentBlob(messageId, attachmentId))
  }, [online])

  const fetchAttachmentBlob = async (messageId: string, attachmentId: string) => {
    const response = await desktopNetworkFetch(
      toApiUrl(`${mailBasePath}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`),
      { credentials: "include", headers: getApiRequestHeaders() },
    )
    if (!response.ok) throw new Error("The attachment could not be downloaded.")
    return response.blob()
  }

  const modifyThread = useCallback(async (threadId: string, modification: MailModifyRequest) => {
    if (!database || !online) throw new Error("Reconnect to organize mail.")
    setMutating(true)
    let snapshot: Awaited<ReturnType<typeof optimisticallyModifyThread>> | null = null
    try {
      snapshot = await optimisticallyModifyThread(database, threadId, modification)
      const response = await apiFetch<MailThreadMutationResponse>(
        `${mailBasePath}/threads/${encodeURIComponent(threadId)}/modify`,
        { body: JSON.stringify(modification), method: "POST" },
      )
      await upsertFullMailThread(database, response)
    } catch (mutationError) {
      if (snapshot && isDefiniteMailMutationFailure(mutationError)) await restoreMailMutation(database, snapshot)
      await queueMailReconciliation(database, { threadIds: [threadId] })
      throw mutationError
    } finally {
      setMutating(false)
    }
  }, [database, online, runSync])

  const batchModifyThreads = useCallback(async (threadIds: string[], modification: MailModifyRequest) => {
    if (!database || !online) throw new Error("Reconnect to organize mail.")
    if (!threadIds.length || threadIds.length > 50) throw new Error("Select between 1 and 50 Gmail threads.")
    setMutating(true)
    const snapshots = []
    try {
      for (const threadId of threadIds) {
        snapshots.push(await optimisticallyModifyThread(database, threadId, modification))
      }
      await apiFetch(`${mailBasePath}/threads/batch-modify`, {
        body: JSON.stringify({ ...modification, ids: threadIds }),
        method: "POST",
      })
      void runSync()
    } catch (mutationError) {
      if (isDefiniteMailMutationFailure(mutationError)) {
        for (const snapshot of snapshots) await restoreMailMutation(database, snapshot)
      }
      await queueMailReconciliation(database, { threadIds })
      throw mutationError
    } finally {
      setMutating(false)
    }
  }, [database, online, runSync])

  const actOnThread = useCallback(async (threadId: string, action: "restore" | "trash") => {
    if (!database || !online) throw new Error("Reconnect to organize mail.")
    const modification = action === "trash"
      ? { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }
      : { removeLabelIds: ["TRASH"] }
    setMutating(true)
    let snapshot: Awaited<ReturnType<typeof optimisticallyModifyThread>> | null = null
    try {
      snapshot = await optimisticallyModifyThread(database, threadId, modification)
      const response = await apiFetch<MailThreadMutationResponse>(
        `${mailBasePath}/threads/${encodeURIComponent(threadId)}/action`,
        { body: JSON.stringify({ action }), method: "POST" },
      )
      await upsertFullMailThread(database, response)
    } catch (mutationError) {
      if (snapshot && isDefiniteMailMutationFailure(mutationError)) await restoreMailMutation(database, snapshot)
      await queueMailReconciliation(database, { threadIds: [threadId] })
      throw mutationError
    } finally {
      setMutating(false)
    }
  }, [database, online, runSync])

  const modifyMessage = useCallback(async (messageId: string, modification: MailModifyRequest) => {
    if (!database || !online) throw new Error("Reconnect to organize mail.")
    setMutating(true)
    let snapshot: Awaited<ReturnType<typeof optimisticallyModifyMessage>> | null = null
    try {
      snapshot = await optimisticallyModifyMessage(database, messageId, modification)
      const response = await apiFetch<MailMessageMutationResponse>(
        `${mailBasePath}/messages/${encodeURIComponent(messageId)}/modify`,
        { body: JSON.stringify(modification), method: "POST" },
      )
      await reconcileMailMessage(database, response.message)
    } catch (mutationError) {
      if (snapshot && isDefiniteMailMutationFailure(mutationError)) await restoreMailMutation(database, snapshot)
      await queueMailReconciliation(database, { messageIds: [messageId] })
      throw mutationError
    } finally {
      setMutating(false)
    }
  }, [database, online, runSync])

  const actOnMessage = useCallback(async (messageId: string, action: "restore" | "trash") => {
    if (!database || !online) throw new Error("Reconnect to organize mail.")
    const modification = action === "trash"
      ? { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }
      : { removeLabelIds: ["TRASH"] }
    setMutating(true)
    let snapshot: Awaited<ReturnType<typeof optimisticallyModifyMessage>> | null = null
    try {
      snapshot = await optimisticallyModifyMessage(database, messageId, modification)
      const response = await apiFetch<MailMessageMutationResponse>(
        `${mailBasePath}/messages/${encodeURIComponent(messageId)}/action`,
        { body: JSON.stringify({ action }), method: "POST" },
      )
      await reconcileMailMessage(database, response.message)
    } catch (mutationError) {
      if (snapshot && isDefiniteMailMutationFailure(mutationError)) await restoreMailMutation(database, snapshot)
      await queueMailReconciliation(database, { messageIds: [messageId] })
      throw mutationError
    } finally {
      setMutating(false)
    }
  }, [database, online, runSync])

  const createLabel = useCallback(async (input: MailLabelWriteRequest) => {
    if (!database || !online) throw new Error("Reconnect to manage Gmail labels.")
    setMutating(true)
    try {
      const { label } = await apiFetch<{ label: MailLabelRecord }>(`${mailBasePath}/labels`, {
        body: JSON.stringify(input),
        method: "POST",
      })
      await database.labels.put(label)
      return label
    } finally {
      setMutating(false)
    }
  }, [database, online])

  const updateLabel = useCallback(async (label: MailLabelRecord, input: MailLabelWriteRequest) => {
    if (!database || !online) throw new Error("Reconnect to manage Gmail labels.")
    setMutating(true)
    try {
      await database.labels.put({ ...label, ...input })
      const response = await apiFetch<{ label: MailLabelRecord }>(
        `${mailBasePath}/labels/${encodeURIComponent(label.id)}`,
        { body: JSON.stringify(input), method: "PATCH" },
      )
      await database.labels.put(response.label)
      return response.label
    } catch (mutationError) {
      if (isDefiniteMailMutationFailure(mutationError)) await database.labels.put(label)
      else void runSync()
      throw mutationError
    } finally {
      setMutating(false)
    }
  }, [database, online, runSync])

  const deleteLabel = useCallback(async (labelId: string) => {
    if (!database || !online) throw new Error("Reconnect to manage Gmail labels.")
    setMutating(true)
    try {
      await apiFetch(`${mailBasePath}/labels/${encodeURIComponent(labelId)}`, { method: "DELETE" })
      await deleteMailLabelFromCache(database, labelId)
    } finally {
      setMutating(false)
    }
  }, [database, online])

  const reconcilePending = useCallback(async () => {
    if (!database || !online) return
    const state = await database.syncState.get("primary")
    for (const threadId of state?.pendingThreadReconciliationIds ?? []) {
      try {
        const response = await apiFetch<MailThreadMutationResponse>(`${mailBasePath}/threads/${encodeURIComponent(threadId)}`)
        await upsertFullMailThread(database, response)
        await clearMailReconciliation(database, { threadId })
      } catch (reconciliationError) {
        if (reconciliationError instanceof ApiError && reconciliationError.status === 404) {
          await deleteMailThreadFromCache(database, threadId)
          await clearMailReconciliation(database, { threadId })
          continue
        }
        return
      }
    }
    for (const messageId of state?.pendingMessageReconciliationIds ?? []) {
      try {
        const response = await apiFetch<MailMessageMutationResponse>(`${mailBasePath}/messages/${encodeURIComponent(messageId)}`)
        await reconcileMailMessage(database, response.message)
        await clearMailReconciliation(database, { messageId })
      } catch (reconciliationError) {
        if (reconciliationError instanceof ApiError && reconciliationError.status === 404) {
          await deleteMailMessageFromCache(database, messageId)
          await clearMailReconciliation(database, { messageId })
          continue
        }
        return
      }
    }
    if ((state?.pendingThreadReconciliationIds?.length ?? 0) + (state?.pendingMessageReconciliationIds?.length ?? 0) > 0) {
      void runSync()
    }
  }, [database, online, runSync])

  useEffect(() => {
    if (!database || !online) return
    const timer = window.setTimeout(() => void reconcilePending(), 0)
    return () => window.clearTimeout(timer)
  }, [database, online, reconcilePending, syncState?.pendingMessageReconciliationIds, syncState?.pendingThreadReconciliationIds])

  return {
    database,
    actOnMessage,
    actOnThread,
    batchModifyThreads,
    createLabel,
    deleteLabel,
    downloadAttachment,
    error,
    hasMore: Boolean(syncState?.pageTokens[input.view]),
    labels: labels ?? [],
    loadInlineAttachment,
    modifyMessage,
    modifyThread,
    mutating,
    online,
    openThread,
    prefetchThread,
    refresh: runSync,
    loadMore: () => runSync({ loadMore: true }),
    syncing,
    threads,
    updateLabel,
  }
}

function isDefiniteMailMutationFailure(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}

function threadMatchesView(thread: MailThreadSummary, view: MailView) {
  switch (view) {
    case "all_mail": return !["SPAM", "TRASH"].some((label) => thread.labelIds.includes(label))
    case "archive": return !["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"].some((label) => thread.labelIds.includes(label))
    case "bin": return thread.labelIds.includes("TRASH")
    case "drafts": return thread.labelIds.includes("DRAFT")
    case "inbox": return thread.labelIds.includes("INBOX")
    case "sent": return thread.labelIds.includes("SENT")
    case "spam": return thread.labelIds.includes("SPAM")
    case "starred": return thread.starred
    case "trash": return thread.labelIds.includes("TRASH")
    case "unread": return thread.unread
  }
}
