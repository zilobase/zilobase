import { useEffect, useMemo, useRef, useState } from "react"
import {
  HocuspocusProvider,
  type StatesArray,
} from "@hocuspocus/provider"
import type { SessionUser } from "@zilobase/features/auth"
import * as Y from "yjs"

import { ApiError, apiFetch } from "@/lib/api"
import {
  applyTicketState,
  connectLocalPageDocument,
  documentDiffersFromConfirmed,
  flushLocalPageDocument,
  openLocalPageDocument,
  recordConfirmedDocument,
  type CollaborationTicket,
} from "@/lib/offline-documents"
import { patchOfflineItem } from "@/lib/offline-store"
import { useConnectivity, useOfflineManifest } from "@/providers/offline-provider"

export type CollaborationUser = {
  avatar?: string | null
  clientId: number
  color: string
  id: string
  name: string
}

type CollaborationStatus =
  | "local"
  | "connecting"
  | "connected"
  | "disconnected"
  | "blocked"

export function usePageCollaboration({
  enabled,
  pageId,
  user,
  workspaceId,
}: {
  enabled: boolean
  pageId: string
  user: SessionUser | null | undefined
  workspaceId?: string | null
}) {
  const manifest = useOfflineManifest()
  const connectivity = useConnectivity()
  const offlineItem = manifest.items.find(
    (item) => item.kind === "page" && item.id === pageId,
  )
  const downloaded = Boolean(offlineItem && workspaceId)
  const [document, setDocument] = useState<Y.Doc | null>(null)
  const [localPage, setLocalPage] = useState<Awaited<ReturnType<typeof openLocalPageDocument>> | null>(null)
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [status, setStatus] = useState<CollaborationStatus>("disconnected")
  const [synced, setSynced] = useState(false)
  const [unsyncedChanges, setUnsyncedChanges] = useState(0)
  const [users, setUsers] = useState<CollaborationUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const dirtyMarked = useRef(Boolean(offlineItem?.dirty))

  useEffect(() => {
    if (!enabled || !user) {
      setDocument(null)
      setError(null)
      return
    }

    let disposed = false
    let local: Awaited<ReturnType<typeof openLocalPageDocument>> | null = null
    let ephemeral: Y.Doc | null = null

    const prepare = async () => {
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
          setStatus(connectivity === "online" ? "connecting" : "local")
          setLocalPage(local)
          setDocument(local.document)
          return
        }

        if (connectivity !== "online") return
        const ticket = await getTicket(pageId)
        ephemeral = new Y.Doc()
        applyTicketState(ephemeral, ticket)
        if (!disposed) setDocument(ephemeral)
      } catch (reason) {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? `Local storage failed — editing paused: ${reason.message}`
              : "Local storage failed — editing paused.",
          )
        }
      }
    }
    void prepare()

    return () => {
      disposed = true
      setDocument(null)
      setLocalPage(null)
      local?.persistence.destroy()
      local?.document.destroy()
      ephemeral?.destroy()
    }
    // Keep a downloaded document stable through connectivity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloaded, enabled, pageId, user?.id, workspaceId])

  useEffect(() => {
    if (!document || !downloaded || !localPage) return
    let flushTimer: number | null = null
    const markDirty = (_update: Uint8Array, origin: unknown) => {
      if (!(origin instanceof HocuspocusProvider) && !dirtyMarked.current) {
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
    if (!document || !enabled || !user || connectivity !== "online") {
      setProvider(null)
      setSynced(false)
      setUsers([])
      if (document && downloaded) setStatus("local")
      return
    }

    let disposed = false
    let activeProvider: HocuspocusProvider | null = null
    setStatus("connecting")
    setError(null)

    void getTicket(pageId)
      .then((ticket) => {
        if (disposed) return
        applyTicketState(document, ticket)
        activeProvider = connectLocalPageDocument({
          document,
          onAuthenticationFailed: (reason) => {
            if (!disposed) {
              setStatus("blocked")
              setError(reason)
              if (downloaded) {
                void patchOfflineItem("page", pageId, { blocked: true })
              }
            }
          },
          onStatus: (nextStatus) => {
            if (!disposed) setStatus(nextStatus)
          },
          onUnsyncedChanges: (count) => {
            if (disposed) return
            setUnsyncedChanges(count)
            if (downloaded && count === 0 && activeProvider?.synced) {
              dirtyMarked.current = false
              void recordConfirmedDocument(pageId, document)
            }
          },
          onUsers: (states) => {
            if (!disposed) setUsers(readCollaborationUsers(states))
          },
          pageId,
          refreshTicket: () => getTicket(pageId),
          ticket,
        })
        activeProvider.on("synced", ({ state }: { state: boolean }) => {
          if (disposed || !state) return
          setSynced(true)
          if (downloaded && !activeProvider?.hasUnsyncedChanges) {
            dirtyMarked.current = false
            void recordConfirmedDocument(pageId, document)
          }
        })
        setProvider(activeProvider)
      })
      .catch((reason: unknown) => {
        if (disposed) return
        const blocked = reason instanceof ApiError && (reason.status === 403 || reason.status === 404)
        setStatus(blocked ? "blocked" : downloaded ? "local" : "disconnected")
        setError(
          blocked || !downloaded
            ? reason instanceof Error
              ? reason.message
              : "Could not start collaboration."
            : null,
        )
        if (downloaded && blocked) {
          void patchOfflineItem("page", pageId, { blocked: true })
        }
      })

    return () => {
      disposed = true
      activeProvider?.destroy()
      setProvider(null)
      setSynced(false)
      setUsers([])
    }
  }, [connectivity, document, downloaded, enabled, pageId, user])

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

function getTicket(pageId: string) {
  return apiFetch<CollaborationTicket>(
    `/pages/${encodeURIComponent(pageId)}/collaboration-ticket`,
    { method: "POST" },
  )
}

function readCollaborationUsers(states: StatesArray) {
  const users = new Map<string, CollaborationUser>()
  for (const state of states) {
    const user = state.user as Partial<CollaborationUser> | undefined
    if (!user || typeof user.id !== "string" || typeof user.name !== "string" || typeof user.color !== "string") continue
    users.set(user.id, {
      avatar: user.avatar,
      clientId: state.clientId,
      color: user.color,
      id: user.id,
      name: user.name,
    })
  }
  return [...users.values()]
}

function collaborationColor(userId: string) {
  const colors = ["#0ea5e9", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#eab308"]
  let hash = 0
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return colors[Math.abs(hash) % colors.length] ?? colors[0]
}
