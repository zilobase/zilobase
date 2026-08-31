import type { QueryClient } from "@tanstack/react-query"

import { applyNavDelta, type NavDelta } from "./nav-delta"
import {
  pagesNavRootQueryKey,
  type PageNavigationPayload,
} from "./queries"

export const NAVIGATION_REALTIME_PROTOCOL = "zilobase.navigation.v1"
export const NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX =
  "zilobase.navigation.auth."
export const NAVIGATION_REALTIME_PING = JSON.stringify({ type: "realtime.ping" })

export type NavigationRealtimeInvalidateEvent = {
  committedAt: string
  eventId: string
  protocolVersion: 1
  type: "navigation.invalidate"
  workspaceId: string
}

export type NavigationRealtimeReadyEvent = {
  protocolVersion: 1
  sessionId: string
  type: "navigation.ready"
  workspaceId: string
}

export type NavigationRealtimeTicket = {
  expiresAt: string
  sessionId: string
  token: string
  websocketProtocols: string[]
  websocketUrl: string
  workspaceId: string
}

export function isNavigationRealtimeEvent(
  value: unknown,
): value is NavigationRealtimeInvalidateEvent | NavigationRealtimeReadyEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const event = value as Record<string, unknown>
  if (
    event.type === "navigation.ready" &&
    event.protocolVersion === 1 &&
    typeof event.sessionId === "string" &&
    typeof event.workspaceId === "string"
  ) return true

  return event.type === "navigation.invalidate" &&
    event.protocolVersion === 1 &&
    typeof event.eventId === "string" &&
    typeof event.committedAt === "string" &&
    typeof event.workspaceId === "string"
}

export function applyNavigationDeltaToCache(
  queryClient: QueryClient,
  workspaceId: string,
  delta: NavDelta | null | undefined,
) {
  if (!delta) return false
  const queryKey = pagesNavRootQueryKey(workspaceId)
  const hasSnapshot = queryClient
    .getQueriesData<PageNavigationPayload>({ queryKey })
    .some(([, current]) => current !== undefined)

  if (!hasSnapshot) {
    void queryClient.invalidateQueries({ queryKey })
    return false
  }

  queryClient.setQueriesData<PageNavigationPayload | undefined>(
    { queryKey },
    (current) => applyNavDelta(current, delta),
  )
  return true
}
