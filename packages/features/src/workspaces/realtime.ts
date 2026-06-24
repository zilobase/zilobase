import { useEffect, useRef, useState } from "react"

import { useNotelabFeatures } from "../context"
import {
  bindVisibilityOnHidden,
  getReconnectDelayMs,
  shouldReconnectRealtimeSocket,
  type RealtimeSocketStatus,
} from "../realtime/socket-lifecycle"
import { createWorkspaceRealtimeSubscription } from "./realtime-subscription"
import {
  getWorkspaceRealtimeUrl,
  normalizeWorkspaceRealtimeMessageData,
  parseWorkspaceRealtimeEvent,
  parseWorkspaceRealtimeFrame,
} from "./realtime-utils"

type WorkspaceRealtimeOptions = {
  enabled?: boolean
  organizationId?: string | null
}

export function useWorkspaceRealtime(
  workspaceId: string | null | undefined,
  {
    enabled = true,
    organizationId = null,
  }: WorkspaceRealtimeOptions = {},
) {
  const { queryClient, realtimeBaseUrl } = useNotelabFeatures()
  const [status, setStatus] = useState<RealtimeSocketStatus>("offline")
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)

  useEffect(() => {
    if (!enabled || !workspaceId || typeof WebSocket === "undefined") {
      setStatus("offline")
      return
    }

    const subscription = createWorkspaceRealtimeSubscription({
      organizationId,
      queryClient,
      workspaceId,
    })

    let disposed = false

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
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

      socket.binaryType = "arraybuffer"
      socketRef.current = socket

      socket.addEventListener("open", () => {
        if (disposed || socketRef.current !== socket) {
          return
        }

        setStatus("connected")

        if (reconnectAttemptRef.current > 0) {
          subscription.scheduleReconnectRefetch()
        }

        reconnectAttemptRef.current = 0
      })

      socket.addEventListener("message", (event) => {
        if (disposed || socketRef.current !== socket) {
          return
        }

        void handleRealtimeSocketMessage(event.data, subscription)
      })

      socket.addEventListener("close", () => {
        if (disposed || socketRef.current !== socket) {
          return
        }

        setStatus("disconnected")
        socketRef.current = null

        if (!shouldReconnectRealtimeSocket()) {
          return
        }

        reconnectAttemptRef.current += 1
        reconnectTimeoutRef.current = window.setTimeout(
          connect,
          getReconnectDelayMs(reconnectAttemptRef.current),
        )
      })

      socket.addEventListener("error", () => {
        if (socketRef.current === socket) {
          socket.close()
        }
      })
    }

    const unbindVisibility = bindVisibilityOnHidden({
      isDisposed: () => disposed,
      onHidden: () => {
        clearReconnectTimeout()
        socketRef.current?.close()
        socketRef.current = null
        setStatus("offline")
      },
      onVisible: () => {
        if (!socketRef.current) {
          connect()
        }
      },
    })

    connect()

    return () => {
      disposed = true
      setStatus("offline")
      subscription.dispose()
      unbindVisibility()
      clearReconnectTimeout()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [enabled, organizationId, queryClient, realtimeBaseUrl, workspaceId])

  return { status }
}

async function handleRealtimeSocketMessage(
  data: unknown,
  subscription: ReturnType<typeof createWorkspaceRealtimeSubscription>,
) {
  const normalized = await normalizeWorkspaceRealtimeMessageData(data)

  if (!normalized) {
    return
  }

  const message =
    typeof normalized === "string"
      ? parseWorkspaceRealtimeEvent(normalized)
      : parseWorkspaceRealtimeFrame(normalized)

  if (message) {
    subscription.handleEvent(message)
  }
}