import { useEffect, useMemo, useRef, useState } from "react"

import { useNotelabFeatures } from "../context"

import {
  databaseQueryKey,
  type DatabasePayload,
} from "./queries"
import { isRecentDatabaseClientMutationId } from "./mutation-tracker"
import {
  addCollaboratorColor,
  createCellPresenceByKey,
  getDatabaseChangedRefetchDecision,
  getDatabaseRealtimeUrl,
  parseDatabaseRealtimeMessage,
  type DatabasePresenceCollaborator,
} from "./realtime-utils"

export type { DatabasePresenceCollaborator } from "./realtime-utils"

type DatabaseRealtimeOptions = {
  activePropertyId?: string | null
  activeRowId?: string | null
  activeViewId?: string | null
  enabled?: boolean
  localVersion?: number | null
}

const refetchDebounceMs = 120
const stalePresenceMs = 45_000
const presenceHeartbeatMs = 20_000

export function useDatabaseRealtime(
  databaseId: string | null | undefined,
  {
    activePropertyId = null,
    activeRowId = null,
    activeViewId = null,
    enabled = true,
    localVersion = null,
  }: DatabaseRealtimeOptions = {},
) {
  const { queryClient, realtimeBaseUrl } = useNotelabFeatures()
  const [status, setStatus] = useState<
    "connected" | "connecting" | "disconnected" | "offline"
  >("offline")
  const [collaboratorsBySession, setCollaboratorsBySession] = useState<
    Record<string, DatabasePresenceCollaborator>
  >({})
  const socketRef = useRef<WebSocket | null>(null)
  const refetchTimeoutRef = useRef<number | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const latestVersionRef = useRef<number | null>(localVersion)

  useEffect(() => {
    if (typeof localVersion === "number") {
      latestVersionRef.current = Math.max(
        latestVersionRef.current ?? 0,
        localVersion,
      )
    }
  }, [localVersion])

  useEffect(() => {
    if (!enabled || !databaseId || typeof WebSocket === "undefined") {
      setStatus("offline")
      setCollaboratorsBySession({})
      return
    }

    let disposed = false

    const scheduleRefetch = () => {
      if (refetchTimeoutRef.current !== null) {
        window.clearTimeout(refetchTimeoutRef.current)
      }

      refetchTimeoutRef.current = window.setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: databaseQueryKey(databaseId),
        })
      }, refetchDebounceMs)
    }

    const connect = () => {
      if (disposed) {
        return
      }

      setStatus("connecting")

      const socket = new WebSocket(
        getDatabaseRealtimeUrl(databaseId, realtimeBaseUrl, window.location.origin),
      )

      socket.binaryType = "arraybuffer"
      socketRef.current = socket

      socket.addEventListener("open", () => {
        if (disposed || socketRef.current !== socket) {
          return
        }

        const currentPayload = queryClient.getQueryData<DatabasePayload | null>(
          databaseQueryKey(databaseId),
        )
        const lastSeenVersion =
          latestVersionRef.current ?? currentPayload?.database.version ?? null

        setStatus("connected")
        socket.send(
          JSON.stringify({
            type: "hello",
            lastSeenVersion,
          }),
        )

        if (reconnectAttemptRef.current > 0) {
          scheduleRefetch()
        }

        reconnectAttemptRef.current = 0
      })

      socket.addEventListener("message", (event) => {
        if (disposed || socketRef.current !== socket) {
          return
        }

        void handleDatabaseRealtimeSocketMessage(event.data, databaseId, {
          currentVersion: latestVersionRef.current,
          onPresenceClear: (sessionId) => {
            setCollaboratorsBySession((current) => {
              const next = { ...current }

              delete next[sessionId]

              return next
            })
          },
          onPresenceUpdate: (collaborator) => {
            setCollaboratorsBySession((current) => ({
              ...current,
              [collaborator.sessionId]: addCollaboratorColor(collaborator),
            }))
          },
          onReady: (peers) => {
            setCollaboratorsBySession(
              Object.fromEntries(
                peers.map((collaborator) => [
                  collaborator.sessionId,
                  addCollaboratorColor(collaborator),
                ]),
              ),
            )
          },
          scheduleRefetch,
          setLatestVersion: (version) => {
            latestVersionRef.current = version
          },
        })
      })

      socket.addEventListener("close", () => {
        if (disposed || socketRef.current !== socket) {
          return
        }

        setStatus("disconnected")
        socketRef.current = null
        reconnectAttemptRef.current += 1
        reconnectTimeoutRef.current = window.setTimeout(
          connect,
          Math.min(10_000, 500 * 2 ** reconnectAttemptRef.current),
        )
      })

      socket.addEventListener("error", () => {
        if (socketRef.current === socket) {
          socket.close()
        }
      })
    }

    connect()

    return () => {
      disposed = true
      setStatus("offline")
      setCollaboratorsBySession({})

      if (refetchTimeoutRef.current !== null) {
        window.clearTimeout(refetchTimeoutRef.current)
      }

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }

      socketRef.current?.close()
      socketRef.current = null
    }
  }, [databaseId, enabled, queryClient, realtimeBaseUrl])

  useEffect(() => {
    if (!databaseId) {
      return
    }

    const sendPresence = () => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        return
      }

      socketRef.current.send(
        JSON.stringify({
          type: "presence.update",
          activePropertyId,
          activeRowId,
          activeViewId,
          databaseId,
        }),
      )
    }
    const interval = window.setInterval(sendPresence, presenceHeartbeatMs)

    sendPresence()

    return () => window.clearInterval(interval)
  }, [activePropertyId, activeRowId, activeViewId, databaseId])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const staleBefore = Date.now() - stalePresenceMs

      setCollaboratorsBySession((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(
            ([, collaborator]) =>
              Date.parse(collaborator.updatedAt) >= staleBefore,
          ),
        )

        return Object.keys(next).length === Object.keys(current).length
          ? current
          : next
      })
    }, 15_000)

    return () => window.clearInterval(interval)
  }, [])

  const collaborators = useMemo(
    () => Object.values(collaboratorsBySession),
    [collaboratorsBySession],
  )
  const cellPresenceByKey = useMemo(
    () => createCellPresenceByKey(collaborators),
    [collaborators],
  )

  return {
    cellPresenceByKey,
    collaborators,
    status,
  }
}

async function handleDatabaseRealtimeSocketMessage(
  data: unknown,
  databaseId: string,
  handlers: {
    currentVersion: number | null
    onPresenceClear: (sessionId: string) => void
    onPresenceUpdate: (
      collaborator: Omit<DatabasePresenceCollaborator, "color">,
    ) => void
    onReady: (
      peers: Array<Omit<DatabasePresenceCollaborator, "color">>,
    ) => void
    scheduleRefetch: () => void
    setLatestVersion: (version: number | null) => void
  },
) {
  const message = await parseDatabaseRealtimeMessage(data)

  if (!message || message.databaseId !== databaseId) {
    return
  }

  if (message.type === "database.changed") {
    const decision = getDatabaseChangedRefetchDecision({
      clientMutationId: message.clientMutationId,
      currentVersion: handlers.currentVersion,
      isOwnMutation: isRecentDatabaseClientMutationId,
      version: message.version,
    })

    handlers.setLatestVersion(decision.latestVersion)

    if (decision.shouldRefetch) {
      handlers.scheduleRefetch()
    }

    return
  }

  if (message.type === "realtime.ready") {
    handlers.onReady(message.peers)
    return
  }

  if (message.type === "presence.update") {
    handlers.onPresenceUpdate(message.collaborator)
    return
  }

  handlers.onPresenceClear(message.sessionId)
}
