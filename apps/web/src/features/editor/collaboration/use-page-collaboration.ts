import { useEffect, useMemo, useRef, useState } from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { SessionUser } from "@zilobase/features/auth"
import * as Y from "yjs"

import { ApiError, apiFetch } from "@/platform/network/api"
import { scheduleRealtimeAfterPagePaint } from "@/shared/lib/deferred-realtime"
import {
  applyTicketState,
  connectLocalPageDocument,
  documentDiffersFromConfirmed,
  flushLocalPageDocument,
  openLocalPageDocument,
  recordConfirmedDocument,
  shouldMarkOfflineDocumentDirty,
  type CollaborationTicket,
} from "@/features/offline/index"
import { collaborationColor } from "./color"
import { patchOfflineItem } from "@/features/offline/index"
import { useConnectivity, useOfflineManifest } from "@/features/offline/index"
import { startPageConnection } from "./connection-session"
import type { CollaborationUser, CollaborationStatus } from "./collaboration-contracts"

export function usePageCollaboration({
  enabled,
  localOnly = false,
  pageId,
  user,
  workspaceId,
}: {
  enabled: boolean
  localOnly?: boolean
  pageId: string
  user: SessionUser | null | undefined
  workspaceId?: string | null
}) {
  const demoMode = localOnly
  const manifest = useOfflineManifest()
  const connectivity = useConnectivity()
  const offlineItem = manifest.items.find(
    (item) => item.kind === "page" && item.id === pageId,
  )
  const downloaded = Boolean(offlineItem && workspaceId)
  const preparationConnectivity = downloaded ? "downloaded" : connectivity
  const [document, setDocument] = useState<Y.Doc | null>(null)
  const [localPage, setLocalPage] = useState<Awaited<ReturnType<typeof openLocalPageDocument>> | null>(null)
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [status, setStatus] = useState<CollaborationStatus>("disconnected")
  const [synced, setSynced] = useState(false)
  const [unsyncedChanges, setUnsyncedChanges] = useState(0)
  const [users, setUsers] = useState<CollaborationUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const dirtyMarked = useRef(Boolean(offlineItem?.dirty))
  const preparedTicketRef = useRef<{
    pageId: string
    ticket: CollaborationTicket
  } | null>(null)

  useEffect(() => {
    if (!enabled || !user) {
      preparedTicketRef.current = null
      setDocument(null)
      setError(null)
      return
    }

    let disposed = false
    let preparationStarted = false
    const controller = new AbortController()
    let local: Awaited<ReturnType<typeof openLocalPageDocument>> | null = null
    let ephemeral: Y.Doc | null = null

    if (demoMode) {
      setStatus("local")
      setError(null)
      setDocument(null)
      setSynced(false)

      return () => {
        disposed = true
        setDocument(null)
        setSynced(false)
      }
    }

    const prepare = async () => {
      if (preparationStarted) return
      preparationStarted = true

      try {
        if (downloaded && workspaceId) {
          local = await openLocalPageDocument(workspaceId, pageId)
          if (disposed) return
          const differs = documentDiffersFromConfirmed(
            local.document,
            offlineItem?.confirmedStateVector,
          )
          dirtyMarked.current = differs || Boolean(offlineItem?.dirty)
          if (differs && !offlineItem?.dirty) {
            await patchOfflineItem("page", pageId, { dirty: true })
          }
          setStatus("local")
          setLocalPage(local)
          setDocument(local.document)
          return
        }

        if (preparationConnectivity !== "online") return
        const ticket = await getTicket(pageId, controller.signal)
        ephemeral = new Y.Doc()
        applyTicketState(ephemeral, ticket)
        if (!disposed) {
          preparedTicketRef.current = { pageId, ticket }
          setDocument(ephemeral)
        }
      } catch (reason) {
        if (!disposed) {
          setError(
            downloaded
              ? reason instanceof Error
                ? `Local storage failed — editing paused: ${reason.message}`
                : "Local storage failed — editing paused."
              : reason instanceof Error
                ? reason.message
                : "Could not start collaboration.",
          )
        }
      }
    }
    const cancelPreparation = downloaded
      ? null
      : scheduleRealtimeAfterPagePaint(() => void prepare())
    if (downloaded) void prepare()

    return () => {
      disposed = true
      cancelPreparation?.()
      controller.abort()
      setDocument(null)
      setLocalPage(null)
      preparedTicketRef.current = null
      local?.persistence.destroy()
      local?.document.destroy()
      ephemeral?.destroy()
    }
  }, [
    downloaded,
    demoMode,
    enabled,
    pageId,
    preparationConnectivity,
    user?.id,
    workspaceId,
  ])

  useEffect(() => {
    if (!document || !downloaded || !localPage) return
    let flushTimer: number | null = null
    const markDirty = (
      _update: Uint8Array,
      _origin: unknown,
      _document: Y.Doc,
      transaction: Y.Transaction,
    ) => {
      if (shouldMarkOfflineDocumentDirty(transaction) && !dirtyMarked.current) {
        dirtyMarked.current = true
        setUnsyncedChanges((count) => Math.max(1, count))
        void patchOfflineItem("page", pageId, { dirty: true })
      }
      if (flushTimer !== null) window.clearTimeout(flushTimer)
      flushTimer = window.setTimeout(() => {
        flushTimer = null
        void flushLocalPageDocument(localPage).catch(() => {
          setError("Local storage failed — editing paused.")
        })
      }, 750)
    }
    document.on("update", markDirty)
    return () => {
      if (flushTimer !== null) window.clearTimeout(flushTimer)
      document.off("update", markDirty)
    }
  }, [document, downloaded, localPage, pageId])

  useEffect(() => {
    if (demoMode) {
      setProvider(null)
      setSynced(Boolean(document))
      setUsers([])
      if (document) setStatus("local")
      return
    }

    if (!document || !enabled || !user || connectivity !== "online") {
      setProvider(null)
      setSynced(false)
      setUsers([])
      if (document && downloaded) setStatus("local")
      return
    }

    const preparedTicket =
      preparedTicketRef.current?.pageId === pageId
        ? preparedTicketRef.current.ticket
        : null
    preparedTicketRef.current = null

    return startPageConnection({
      document,
      downloaded,
      pageId,
      preparedTicket,
      user: {
        avatar: user.image,
        color: collaborationColor(user.id),
        id: user.id,
        name: user.name || user.email,
      },
      state: {
        provider: setProvider,
        status: setStatus,
        error: setError,
        synced: setSynced,
        unsyncedChanges: setUnsyncedChanges,
        users: setUsers,
        confirmed: () => { dirtyMarked.current = false },
      },
      services: pageConnectionServices,
    })
  }, [connectivity, demoMode, document, downloaded, enabled, pageId, user?.id])

  useEffect(() => {
    if (!provider || connectivity !== "online") return

    let disposed = false
    const cancel = scheduleRealtimeAfterPagePaint(() => {
      if (disposed) return
      setStatus("connecting")
      void provider.connect().catch(() => {
        if (!disposed) {
          setStatus(downloaded ? "local" : "disconnected")
        }
      })
    })

    return () => {
      disposed = true
      cancel()
    }
  }, [connectivity, downloaded, provider])

  const collaborationUser = useMemo(
    () =>
      user
        ? {
            avatar: user.image,
            color: collaborationColor(user.id),
            id: user.id,
            name: user.name || user.email,
          }
        : undefined,
    [user],
  )

  return {
    document,
    downloaded,
    error,
    provider,
    status,
    synced,
    unsyncedChanges,
    user: collaborationUser,
    users,
  }
}

function getTicket(pageId: string, signal?: AbortSignal) {
  return apiFetch<CollaborationTicket>(
    `/pages/${encodeURIComponent(pageId)}/collaboration-ticket`,
    { method: "POST", signal },
  )
}

const pageConnectionServices = {
  applyTicket: applyTicketState,
  connect: connectLocalPageDocument,
  getTicket,
  isAccessDenied: (reason: unknown) =>
    reason instanceof ApiError && (reason.status === 403 || reason.status === 404),
  markBlocked: (pageId: string) => { void patchOfflineItem("page", pageId, { blocked: true }) },
  recordConfirmed: (pageId: string, document: Y.Doc) => { void recordConfirmedDocument(pageId, document) },
  schedule: scheduleRealtimeAfterPagePaint,
}
