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
  parseDatabaseRealtimeEvent,
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
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: databaseQueryKey(databaseId),
          }),
          queryClient.invalidateQueries({ queryKey: ["workspace"] }),
        ])
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

      socketRef.current = socket

      socket.addEventListener("open", () => {
        if (disposed) {
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

        if (reconnectAttemptRef.current > 0 || lastSeenVersion === null) {
          scheduleRefetch()
        }

        reconnectAttemptRef.current = 0
      })

      socket.addEventListener("message", (event) => {
        const message = parseDatabaseRealtimeEvent(event.data)

        if (!message || message.databaseId !== databaseId) {
          return
        }

        if (message.type === "database.changed") {
          const decision = getDatabaseChangedRefetchDecision({
            clientMutationId: message.clientMutationId,
            currentVersion: latestVersionRef.current,
            isOwnMutation: isRecentDatabaseClientMutationId,
            version: message.version,
          })

          latestVersionRef.current = decision.latestVersion

          if (decision.shouldRefetch) {
            scheduleRefetch()
          }

          return
        }

        if (message.type === "realtime.ready") {
          setCollaboratorsBySession(
            Object.fromEntries(
              message.peers.map((collaborator) => [
                collaborator.sessionId,
                addCollaboratorColor(collaborator),
              ]),
            ),
          )
          return
        }

        if (message.type === "presence.update") {
          setCollaboratorsBySession((current) => ({
            ...current,
            [message.collaborator.sessionId]: addCollaboratorColor(
              message.collaborator,
            ),
          }))
          return
        }

        setCollaboratorsBySession((current) => {
          const next = { ...current }

          delete next[message.sessionId]

          return next
        })
      })

      socket.addEventListener("close", () => {
        if (disposed) {
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
        socket.close()
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
