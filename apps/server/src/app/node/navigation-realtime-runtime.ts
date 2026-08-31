import type { IncomingMessage, Server as HttpServer } from "node:http"
import type { Duplex } from "node:stream"
import type { Peer } from "crossws"
import crossws from "crossws/adapters/node"
import type { NavigationRealtimeInvalidateEvent } from "@zilobase/features/pages/navigation-realtime"
import { NAVIGATION_REALTIME_PING } from "@zilobase/features/pages/navigation-realtime"

import type { RuntimeEnv } from "../../shared/config/config"
import {
  NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX,
  NAVIGATION_REALTIME_PROTOCOL,
  verifyNavigationRealtimeTicket,
  type NavigationRealtimeTicketClaims,
} from "../../shared/security/navigation-realtime-ticket"
import { navigationRealtimeChannel, type NodeRealtimeBus, type RealtimeSubscription } from "../../infrastructure/node/realtime-bus"

type Room = { peers: Set<Peer>; unsubscribe?: RealtimeSubscription }

export function attachNodeNavigationRealtimeRuntime(server: HttpServer, env: RuntimeEnv, options: { realtimeBus?: NodeRealtimeBus | null } = {}) {
  const rooms = new Map<string, Room>()
  const claimsByPeer = new WeakMap<Peer, NavigationRealtimeTicketClaims>()
  const bus = options.realtimeBus ?? null
  const websocket = crossws({
    idleTimeout: 45,
    serverOptions: { maxPayload: 4 * 1024 },
    hooks: {
      async upgrade(request) {
        const workspaceId = new URL(request.url).searchParams.get("workspace")
        const token = readTicket(request.headers)
        if (!workspaceId || !token) throw new Response("Missing navigation realtime ticket", { status: 401 })
        const claims = await verifyNavigationRealtimeTicket(token, env)
        if (claims.workspaceId !== workspaceId) throw new Response("Invalid navigation realtime ticket", { status: 403 })
        return { context: { navigationRealtime: claims }, protocol: NAVIGATION_REALTIME_PROTOCOL }
      },
      async open(peer) {
        const claims = peer.context.navigationRealtime as NavigationRealtimeTicketClaims | undefined
        if (!claims) return peer.close(1008, "Invalid navigation realtime session")
        claimsByPeer.set(peer, claims)
        const room = rooms.get(claims.workspaceId) ?? { peers: new Set<Peer>() }
        rooms.set(claims.workspaceId, room)
        room.peers.add(peer)
        if (bus && !room.unsubscribe) room.unsubscribe = await bus.subscribe(navigationRealtimeChannel(claims.workspaceId), (payload) => {
          if (isEvent(payload, claims.workspaceId)) broadcast(room, payload, claimsByPeer)
        })
        peer.send(JSON.stringify({ protocolVersion: 1, sessionId: claims.sessionId, type: "navigation.ready", workspaceId: claims.workspaceId }))
      },
      message(peer, message) {
        if (message.rawData === NAVIGATION_REALTIME_PING) peer.send(JSON.stringify({ type: "realtime.pong" }))
      },
      close(peer) { void remove(peer, rooms, claimsByPeer) },
      error(peer) { void remove(peer, rooms, claimsByPeer); peer.close(1011, "Navigation realtime error") },
    },
  })
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://zilobase.local")
    if (url.pathname !== "/navigation-realtime") return
    void websocket.handleUpgrade(request, socket, head).catch(() => {
      if (!socket.destroyed) socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
    })
  }
  server.on("upgrade", upgrade)
  return {
    async destroy() {
      server.off("upgrade", upgrade)
      await Promise.allSettled([...rooms.values()].map((room) => room.unsubscribe?.()))
      await websocket.close(1001, "Server shutting down")
    },
    async publish(event: NavigationRealtimeInvalidateEvent) {
      const room = rooms.get(event.workspaceId)
      if (room) broadcast(room, event, claimsByPeer)
      await bus?.publish(navigationRealtimeChannel(event.workspaceId), event)
    },
  }
}

function broadcast(room: Room, event: NavigationRealtimeInvalidateEvent, claimsByPeer: WeakMap<Peer, NavigationRealtimeTicketClaims>) {
  const encoded = JSON.stringify(event)
  for (const peer of room.peers) {
    const claims = claimsByPeer.get(peer)
    if (!claims || claims.exp <= Date.now()) { room.peers.delete(peer); peer.close(1008, "Navigation realtime ticket expired") }
    else peer.send(encoded)
  }
}
async function remove(peer: Peer, rooms: Map<string, Room>, claimsByPeer: WeakMap<Peer, NavigationRealtimeTicketClaims>) {
  const claims = claimsByPeer.get(peer); if (!claims) return
  claimsByPeer.delete(peer); const room = rooms.get(claims.workspaceId); room?.peers.delete(peer)
  if (room && !room.peers.size) { await room.unsubscribe?.(); rooms.delete(claims.workspaceId) }
}
function readTicket(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim())
  if (!protocols.includes(NAVIGATION_REALTIME_PROTOCOL)) return null
  return protocols.find((value) => value.startsWith(NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX))?.slice(NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX.length) ?? null
}
function isEvent(value: unknown, workspaceId: string): value is NavigationRealtimeInvalidateEvent {
  if (!value || typeof value !== "object") return false
  const event = value as Record<string, unknown>
  return event.type === "navigation.invalidate" && event.protocolVersion === 1 && event.workspaceId === workspaceId && typeof event.eventId === "string" && typeof event.committedAt === "string"
}
