import { useEffect, useRef, useState } from "react"

import { useNotelabFeatures } from "../context"
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
  const [status, setStatus] = useState<
    "connected" | "connecting" | "disconnected" | "offline"
  >("offline")
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
      subscription.dispose()

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }

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
