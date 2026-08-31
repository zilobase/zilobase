import { useEffect } from "react"

import { useZilobaseFeatures } from "../shared/context"
import {
  isNavigationRealtimeEvent,
  NAVIGATION_REALTIME_PING,
  type NavigationRealtimeTicket,
} from "./navigation-realtime-contract"
import { pagesNavRootQueryKey } from "./queries"

const HEARTBEAT_MS = 20_000
const INVALIDATION_DEBOUNCE_MS = 75

export function useNavigationRealtime(workspaceId: string | null | undefined) {
  const { apiFetch, navigationRealtimeEnabled = false, queryClient } =
    useZilobaseFeatures()

  useEffect(() => {
    if (!workspaceId || !navigationRealtimeEnabled || typeof WebSocket === "undefined") return
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    let stopped = false
    const seen = new Set<string>()

    const invalidate = () => {
      if (invalidateTimer) return
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null
        void queryClient.invalidateQueries({ queryKey: pagesNavRootQueryKey(workspaceId) })
      }, INVALIDATION_DEBOUNCE_MS)
    }
    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return
      const cap = Math.min(30_000, 500 * 2 ** reconnectAttempt++)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, Math.floor(Math.random() * cap))
    }
    const connect = async () => {
      if (stopped || socket || !navigator.onLine) return
      try {
        const ticket = await apiFetch<NavigationRealtimeTicket>(
          `/workspaces/${encodeURIComponent(workspaceId)}/navigation-realtime-ticket`,
          { body: "{}", method: "POST" },
        )
        if (stopped) return
        const next = new WebSocket(ticket.websocketUrl, ticket.websocketProtocols)
        socket = next
        next.addEventListener("open", () => {
          reconnectAttempt = 0
          heartbeatTimer = setInterval(() => {
            if (next.readyState === WebSocket.OPEN) next.send(NAVIGATION_REALTIME_PING)
          }, HEARTBEAT_MS)
        })
        next.addEventListener("message", (raw) => {
          let message: unknown
          try { message = JSON.parse(String(raw.data)) } catch { return }
          if (!isNavigationRealtimeEvent(message) || message.workspaceId !== workspaceId) return
          if (message.type === "navigation.ready") { invalidate(); return }
          if (seen.has(message.eventId)) return
          seen.add(message.eventId)
          if (seen.size > 256) seen.delete(seen.values().next().value!)
          invalidate()
        })
        next.addEventListener("close", () => {
          if (socket !== next) return
          socket = null
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          heartbeatTimer = null
          scheduleReconnect()
        })
      } catch { scheduleReconnect() }
    }
    const onOnline = () => { invalidate(); void connect() }
    const onVisibility = () => {
      if (document.visibilityState === "visible") invalidate()
    }
    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVisibility)
    void connect()
    return () => {
      stopped = true
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisibility)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (invalidateTimer) clearTimeout(invalidateTimer)
      socket?.close(1000, "Workspace changed")
    }
  }, [apiFetch, navigationRealtimeEnabled, queryClient, workspaceId])
}
