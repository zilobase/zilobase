import type { IncomingMessage, Server as HttpServer } from "node:http"
import type { Duplex } from "node:stream"
import type { Peer } from "crossws"
import crossws from "crossws/adapters/node"

import type { MailNotificationEvent } from "../../infrastructure/runtime/runtime-adapter"
import { mailRealtimeChannel, type NodeRealtimeBus, type RealtimeSubscription } from "../../infrastructure/node/realtime-bus"
import {
  MAIL_REALTIME_AUTH_PROTOCOL_PREFIX,
  MAIL_REALTIME_PROTOCOL,
  verifyMailRealtimeTicket,
  type MailRealtimeTicketClaims,
} from "../../features/mail/mail-realtime-ticket"
import type { RuntimeEnv } from "../../shared/config/config"
import { recordMailMetric } from "../../features/mail/mail-metrics"

type Room = {
  peers: Set<Peer>
  unsubscribe?: RealtimeSubscription
}

export function attachNodeMailRealtimeRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: { realtimeBus?: NodeRealtimeBus | null } = {},
) {
  const rooms = new Map<string, Room>()
  const attachments = new WeakMap<Peer, MailRealtimeTicketClaims>()
  const bus = options.realtimeBus ?? null
  const websocket = crossws({
    idleTimeout: 45,
    serverOptions: { maxPayload: 4 * 1024 },
    hooks: {
      async upgrade(request) {
        const connectionId = new URL(request.url).searchParams.get("connection")
        const token = readTicket(request.headers)
        if (!connectionId || !token) throw new Response("Missing mail realtime ticket", { status: 401 })
        const claims = await verifyMailRealtimeTicket(token, env)
        if (claims.connectionId !== connectionId) throw new Response("Invalid mail realtime ticket", { status: 403 })
        return { context: { mailRealtime: claims }, protocol: MAIL_REALTIME_PROTOCOL }
      },
      async open(peer) {
        const claims = readClaims(peer)
        if (!claims) return peer.close(1008, "Invalid mail realtime session")
        attachments.set(peer, claims)
        const room = rooms.get(claims.connectionId) ?? { peers: new Set<Peer>() }
        rooms.set(claims.connectionId, room)
        room.peers.add(peer)
        void recordMailMetric("socket_state", { connectionId: claims.connectionId, code: "open", outcome: "success" })
        if (bus && !room.unsubscribe) {
          room.unsubscribe = await bus.subscribe(mailRealtimeChannel(claims.connectionId), (payload) => {
            if (isNotification(payload, claims.connectionId)) broadcast(room, payload, attachments)
          })
        }
        peer.send(JSON.stringify({ type: "mail.ready" }))
      },
      message(peer, message) {
        if (typeof message.rawData !== "string" || message.rawData.length > 4_096) return peer.close(1003, "Invalid mail realtime message")
        if (message.rawData === JSON.stringify({ type: "mail.ping" })) {
          peer.send(JSON.stringify({ type: "mail.pong" }))
        }
      },
      close(peer) {
        const claims = attachments.get(peer)
        if (claims) void recordMailMetric("socket_state", { connectionId: claims.connectionId, code: "closed", outcome: "success" })
        void removePeer(peer, attachments, rooms)
      },
      error(peer) {
        const claims = attachments.get(peer)
        if (claims) void recordMailMetric("socket_state", { connectionId: claims.connectionId, code: "error", outcome: "failure" })
        void removePeer(peer, attachments, rooms)
        peer.close(1011, "Mail realtime error")
      },
    },
  })
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://zilobase.local")
    if (url.pathname !== "/mail-realtime") return
    void websocket.handleUpgrade(request, socket, head).catch(() => rejectUpgrade(socket))
  }
  server.on("upgrade", upgrade)
  return {
    async destroy() {
      server.off("upgrade", upgrade)
      await Promise.allSettled([...rooms.values()].map((room) => room.unsubscribe?.()))
      await websocket.close(1001, "Server shutting down")
    },
    async publishNotification(event: MailNotificationEvent) {
      const room = rooms.get(event.connectionId)
      if (room) broadcast(room, event, attachments)
      await bus?.publish(mailRealtimeChannel(event.connectionId), event)
    },
  }
}

function broadcast(room: Room, event: Pick<MailNotificationEvent, "connectionId" | "revision">, attachments: WeakMap<Peer, MailRealtimeTicketClaims>) {
  const encoded = JSON.stringify({ connectionId: event.connectionId, revision: event.revision, type: "mail.invalidate" })
  for (const peer of room.peers) {
    const claims = attachments.get(peer)
    if (!claims || claims.exp <= Date.now()) {
      peer.close(1008, "Mail realtime ticket expired")
      room.peers.delete(peer)
    } else peer.send(encoded)
  }
}

async function removePeer(peer: Peer, attachments: WeakMap<Peer, MailRealtimeTicketClaims>, rooms: Map<string, Room>) {
  const claims = attachments.get(peer)
  if (!claims) return
  attachments.delete(peer)
  const room = rooms.get(claims.connectionId)
  room?.peers.delete(peer)
  if (room && room.peers.size === 0) {
    await room.unsubscribe?.()
    rooms.delete(claims.connectionId)
  }
}

function readTicket(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim())
  if (!protocols.includes(MAIL_REALTIME_PROTOCOL)) return null
  return protocols.find((value) => value.startsWith(MAIL_REALTIME_AUTH_PROTOCOL_PREFIX))?.slice(MAIL_REALTIME_AUTH_PROTOCOL_PREFIX.length) ?? null
}

function readClaims(peer: Peer) {
  const value = peer.context.mailRealtime
  return value && typeof value === "object" ? value as MailRealtimeTicketClaims : null
}

function isNotification(value: unknown, connectionId: string): value is MailNotificationEvent {
  if (!value || typeof value !== "object") return false
  const event = value as Record<string, unknown>
  return event.connectionId === connectionId && Number.isSafeInteger(event.revision) && (event.revision as number) >= 0
}

function rejectUpgrade(socket: Duplex) {
  if (!socket.destroyed) socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
}
