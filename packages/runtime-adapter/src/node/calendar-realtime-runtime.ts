import type { IncomingMessage, Server as HttpServer } from "node:http"
import type { Duplex } from "node:stream"
import type { Peer } from "crossws"
import crossws from "crossws/adapters/node"

import type { CalendarNotificationEvent } from "../capabilities"
import { calendarRealtimeChannel, type NodeRealtimeBus, type RealtimeSubscription } from "./realtime-bus"
import {
  CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX,
  CALENDAR_REALTIME_PROTOCOL,
  verifyCalendarRealtimeTicket,
  type CalendarRealtimeTicketClaims,
} from "@zilobase/server/node-adapter-api"
import { isCalendarFeatureEnabled, type RuntimeEnv } from "@zilobase/server/node-adapter-api"

type Room = {
  peers: Set<Peer>
  unsubscribe?: RealtimeSubscription
}

export function attachNodeCalendarRealtimeRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: { realtimeBus?: NodeRealtimeBus | null } = {},
) {
  const rooms = new Map<string, Room>()
  const attachments = new WeakMap<Peer, CalendarRealtimeTicketClaims>()
  const bus = options.realtimeBus ?? null
  const websocket = crossws({
    idleTimeout: 45,
    serverOptions: { maxPayload: 4 * 1024 },
    hooks: {
      async upgrade(request) {
        const bindingId = new URL(request.url).searchParams.get("binding")
        const token = readTicket(request.headers)
        if (!bindingId || !token) throw new Response("Missing calendar realtime ticket", { status: 401 })
        const claims = await verifyCalendarRealtimeTicket(token, env)
        if (claims.bindingId !== bindingId || !isCalendarFeatureEnabled(env, claims.workspaceId)) throw new Response("Invalid calendar realtime ticket", { status: 403 })
        return { context: { calendarRealtime: claims }, protocol: CALENDAR_REALTIME_PROTOCOL }
      },
      async open(peer) {
        const claims = readClaims(peer)
        if (!claims) return peer.close(1008, "Invalid calendar realtime session")
        attachments.set(peer, claims)
        const room = rooms.get(claims.bindingId) ?? { peers: new Set<Peer>() }
        rooms.set(claims.bindingId, room)
        room.peers.add(peer)
        if (bus && !room.unsubscribe) {
          room.unsubscribe = await bus.subscribe(calendarRealtimeChannel(claims.bindingId), (payload) => {
            if (isNotification(payload, claims.bindingId)) broadcast(room, payload, attachments)
          })
        }
        peer.send(JSON.stringify({ type: "calendar.ready" }))
      },
      message(peer, message) {
        if (typeof message.rawData !== "string" || message.rawData.length > 4_096) return peer.close(1003, "Invalid calendar realtime message")
        if ((attachments.get(peer)?.exp ?? 0) <= Date.now()) return peer.close(1008, "Calendar ticket expired");
        if (message.rawData === JSON.stringify({ type: "calendar.ping" })) {
          peer.send(JSON.stringify({ type: "calendar.pong" }))
        }
      },
      close(peer) {
        const claims = attachments.get(peer)
        void removePeer(peer, attachments, rooms)
      },
      error(peer) {
        const claims = attachments.get(peer)
        void removePeer(peer, attachments, rooms)
        peer.close(1011, "Calendar realtime error")
      },
    },
  })
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://zilobase.local")
    if (url.pathname !== "/calendar-realtime") return
    if (!isCalendarFeatureEnabled(env)) {
      rejectUpgrade(socket, "404 Not Found")
      return
    }
    void websocket.handleUpgrade(request, socket, head).catch(() => rejectUpgrade(socket))
  }
  server.on("upgrade", upgrade)
  return {
    async destroy() {
      server.off("upgrade", upgrade)
      for (const room of rooms.values()) { try { await room.unsubscribe?.() } catch { /* Close remaining rooms even when a bus subscription has failed. */ } }
      await websocket.close(1001, "Server shutting down")
    },
    async publishNotification(event: CalendarNotificationEvent) {
      if (!isCalendarFeatureEnabled(env)) return
      const room = rooms.get(event.bindingId)
      if (room) broadcast(room, event, attachments)
      await bus?.publish(calendarRealtimeChannel(event.bindingId), event)
    },
  }
}

function broadcast(room: Room, event: CalendarNotificationEvent, attachments: WeakMap<Peer, CalendarRealtimeTicketClaims>) {
  const encoded = JSON.stringify({
    bindingId: event.bindingId,
    calendarId: event.calendarId,
    generation: event.generation,
    revision: event.revision,
    type: "calendar.invalidate",
    workspaceId: event.workspaceId,
  })
  for (const peer of room.peers) {
    const claims = attachments.get(peer)
    if (!claims || claims.exp <= Date.now()) {
      peer.close(1008, "Calendar realtime ticket expired")
      room.peers.delete(peer)
    } else if (claims.workspaceId === event.workspaceId && claims.userId === event.userId && claims.accountId === event.accountId) peer.send(encoded)
  }
}

async function removePeer(peer: Peer, attachments: WeakMap<Peer, CalendarRealtimeTicketClaims>, rooms: Map<string, Room>) {
  const claims = attachments.get(peer)
  if (!claims) return
  attachments.delete(peer)
  const room = rooms.get(claims.bindingId)
  room?.peers.delete(peer)
  if (room && room.peers.size === 0) {
    await room.unsubscribe?.()
    rooms.delete(claims.bindingId)
  }
}

function readTicket(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim())
  if (!protocols.includes(CALENDAR_REALTIME_PROTOCOL)) return null
  return protocols.find((value) => value.startsWith(CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX))?.slice(CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX.length) ?? null
}

function readClaims(peer: Peer) {
  const value = peer.context.calendarRealtime
  return value && typeof value === "object" ? value as CalendarRealtimeTicketClaims : null
}

function isNotification(value: unknown, bindingId: string): value is CalendarNotificationEvent {
  if (!value || typeof value !== "object") return false
  const event = value as Record<string, unknown>
  return event.bindingId === bindingId &&
    typeof event.accountId === "string" &&
    typeof event.calendarId === "string" &&
    typeof event.userId === "string" &&
    Number.isSafeInteger(event.generation) &&
    typeof event.workspaceId === "string" &&
    Number.isSafeInteger(event.revision) &&
    (event.revision as number) >= 0
}

function rejectUpgrade(socket: Duplex, status = "401 Unauthorized") {
  if (!socket.destroyed) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}
