import { useEffect, useRef, useState } from "react"

import { useNotelabFeatures } from "../context"
import {
  workspaceQueryKey,
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
  const refetchTimeoutRef = useRef<number | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)

  useEffect(() => {
    if (!enabled || !workspaceId || typeof WebSocket === "undefined") {
      setStatus("offline")
      return
    }

    let disposed = false

    const scheduleRefetch = (eventOrganizationId?: string | null) => {
      if (refetchTimeoutRef.current !== null) {
        window.clearTimeout(refetchTimeoutRef.current)
      }

      refetchTimeoutRef.current = window.setTimeout(() => {
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
          scheduleRefetch()
        }

        reconnectAttemptRef.current = 0
      })

      socket.addEventListener("message", (event) => {
        const message = parseWorkspaceRealtimeEvent(event.data)

        if (!message || message.workspaceId !== workspaceId) {
          return
        }

        if (message.type === "workspace.changed") {
          scheduleRefetch(message.organizationId)
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

      if (refetchTimeoutRef.current !== null) {
        window.clearTimeout(refetchTimeoutRef.current)
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
