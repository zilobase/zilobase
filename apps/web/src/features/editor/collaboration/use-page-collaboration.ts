import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { SessionUser } from "@zilobase/features/auth"
import * as Y from "yjs"

import { ApiError, apiFetch } from "@/platform/network/api"
import { scheduleRealtimeAfterPagePaint } from "@/shared/lib/deferred-realtime"
import {
  applyTicketState,
  connectCollaborationDocument,
  type CollaborationTicket,
} from "./collaboration-connection"
import { collaborationColor } from "./color"
import { getConnectivityState, subscribeConnectivity } from "@/platform/network/connectivity"
import { startPageConnection } from "./connection-session"
import type { CollaborationUser, CollaborationStatus } from "./collaboration-contracts"

export function usePageCollaboration({
  enabled,
  localOnly = false,
  pageId,
  user,
}: {
  enabled: boolean
  localOnly?: boolean
  pageId: string
  user: SessionUser | null | undefined
  workspaceId?: string | null
}) {
  const demoMode = localOnly
  const connectivity = useSyncExternalStore(
    subscribeConnectivity,
    getConnectivityState,
    () => "online" as const,
  )
  const [document, setDocument] = useState<Y.Doc | null>(null)
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [status, setStatus] = useState<CollaborationStatus>("disconnected")
  const [synced, setSynced] = useState(false)
  const [unsyncedChanges, setUnsyncedChanges] = useState(0)
  const [users, setUsers] = useState<CollaborationUser[]>([])
  const [error, setError] = useState<string | null>(null)
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
        if (connectivity !== "online") return
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
            reason instanceof Error ? reason.message : "Could not start collaboration.",
          )
        }
      }
    }
    const cancelPreparation = scheduleRealtimeAfterPagePaint(() => void prepare())

    return () => {
      disposed = true
      cancelPreparation?.()
      controller.abort()
      setDocument(null)
      preparedTicketRef.current = null
      ephemeral?.destroy()
    }
  }, [connectivity, demoMode, enabled, pageId, user?.id])

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
      return
    }

    const preparedTicket =
      preparedTicketRef.current?.pageId === pageId
        ? preparedTicketRef.current.ticket
        : null
    preparedTicketRef.current = null

    return startPageConnection({
      document,
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
      },
      services: pageConnectionServices,
    })
  }, [connectivity, demoMode, document, enabled, pageId, user?.id])

  useEffect(() => {
    if (!provider || connectivity !== "online") return

    let disposed = false
    const cancel = scheduleRealtimeAfterPagePaint(() => {
      if (disposed) return
      setStatus("connecting")
      void provider.connect().catch(() => {
        if (!disposed) {
          setStatus("disconnected")
        }
      })
    })

    return () => {
      disposed = true
      cancel()
    }
  }, [connectivity, provider])

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
  connect: connectCollaborationDocument,
  getTicket,
  isAccessDenied: (reason: unknown) =>
    reason instanceof ApiError && (reason.status === 403 || reason.status === 404),
  schedule: scheduleRealtimeAfterPagePaint,
}
