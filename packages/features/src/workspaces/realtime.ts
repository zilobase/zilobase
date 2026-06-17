import { useEffect, useRef, useState } from "react"

import { useNotelabFeatures } from "../context"
import {
  workspaceCommentsQueryKey,
  workspaceQueryKey,
  workspaceThreadsQueryKey,
  workspacesQueryKey,
} from "./queries"
import {
  getWorkspaceRealtimeUrl,
  parseWorkspaceRealtimeEvent,
} from "./realtime-utils"

type WorkspaceRealtimeOptions = {
  enabled?: boolean
  organizationId?: string | null
}

const refetchDebounceMs = 120

export function useWorkspaceRealtime(
  workspaceId: string | null | undefined,
  { enabled = true, organizationId = null }: WorkspaceRealtimeOptions = {},
) {
  const { queryClient, realtimeBaseUrl } = useNotelabFeatures()
  const [status, setStatus] = useState<
    "connected" | "connecting" | "disconnected" | "offline"
  >("offline")
  const socketRef = useRef<WebSocket | null>(null)
  const workspaceRefetchTimeoutRef = useRef<number | null>(null)
  const commentsRefetchTimeoutRef = useRef<number | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)

  useEffect(() => {
    if (!enabled || !workspaceId || typeof WebSocket === "undefined") {
      setStatus("offline")
      return
    }

    let disposed = false

    const scheduleWorkspaceRefetch = (eventOrganizationId?: string | null) => {
      if (workspaceRefetchTimeoutRef.current !== null) {
        window.clearTimeout(workspaceRefetchTimeoutRef.current)
      }

      workspaceRefetchTimeoutRef.current = window.setTimeout(() => {
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: workspaceQueryKey(workspaceId),
          }),
          queryClient.invalidateQueries({
            queryKey: workspacesQueryKey(eventOrganizationId ?? organizationId),
          }),
          queryClient.invalidateQueries({ queryKey: ["database"] }),
        ])
      }, refetchDebounceMs)
    }

    const scheduleCommentsRefetch = (threadId?: string | null) => {
      if (commentsRefetchTimeoutRef.current !== null) {
        window.clearTimeout(commentsRefetchTimeoutRef.current)
      }

      commentsRefetchTimeoutRef.current = window.setTimeout(() => {
        const invalidations = [
          queryClient.invalidateQueries({
            queryKey: workspaceCommentsQueryKey(workspaceId),
          }),
          queryClient.invalidateQueries({
            queryKey: workspaceThreadsQueryKey(workspaceId),
          }),
        ]

        if (threadId) {
          invalidations.push(
            queryClient.invalidateQueries({
              queryKey: workspaceCommentsQueryKey(workspaceId, threadId),
            }),
          )
        }

        void Promise.all(invalidations)
      }, refetchDebounceMs)
    }

    const connect = () => {
      if (disposed) {
        return
      }

      setStatus("connecting")

      const socket = new WebSocket(
        getWorkspaceRealtimeUrl(
          workspaceId,
          realtimeBaseUrl,
          window.location.origin,
        ),
      )

      socketRef.current = socket

      socket.addEventListener("open", () => {
        if (disposed) {
          return
        }

        setStatus("connected")

        if (reconnectAttemptRef.current > 0) {
          scheduleWorkspaceRefetch()
          scheduleCommentsRefetch()
        }

        reconnectAttemptRef.current = 0
      })

      socket.addEventListener("message", (event) => {
        const message = parseWorkspaceRealtimeEvent(event.data)

        if (!message || message.workspaceId !== workspaceId) {
          return
        }

        if (message.type === "workspace.changed") {
          scheduleWorkspaceRefetch(message.organizationId)
          return
        }

        if (message.type === "comments.changed") {
          scheduleCommentsRefetch(message.threadId)
        }
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

      if (workspaceRefetchTimeoutRef.current !== null) {
        window.clearTimeout(workspaceRefetchTimeoutRef.current)
      }

      if (commentsRefetchTimeoutRef.current !== null) {
        window.clearTimeout(commentsRefetchTimeoutRef.current)
      }

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }

      socketRef.current?.close()
      socketRef.current = null
    }
  }, [enabled, organizationId, queryClient, realtimeBaseUrl, workspaceId])

  return { status }
}
