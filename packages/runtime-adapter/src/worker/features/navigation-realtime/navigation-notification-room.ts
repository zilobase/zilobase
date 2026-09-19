import { DurableObject } from "cloudflare:workers";
import {
  NAVIGATION_REALTIME_PROTOCOL,
  type NavigationRealtimeInvalidateEvent,
  type NavigationRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

import type { WorkerEnvBindings } from "../../adapter";
import { readNavigationRealtimeClaims } from "./security";

type SocketAttachment = { claims: NavigationRealtimeTicketClaims };
const PING = JSON.stringify({ type: "realtime.ping" });
const PONG = JSON.stringify({ type: "realtime.pong" });

export class NavigationNotificationRoom extends DurableObject<WorkerEnvBindings> {
  constructor(ctx: DurableObjectState, env: WorkerEnvBindings) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  async fetch(request: Request) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const workspaceId = new URL(request.url).searchParams.get("workspace");
    const claims = readNavigationRealtimeClaims(request.headers);
    if (!claims || claims.workspaceId !== workspaceId || claims.exp <= Date.now()) {
      return new Response("Unauthorized", { status: 401 });
    }
    this.pruneExpiredSockets();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ claims } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({
      protocolVersion: 1,
      sessionId: claims.sessionId,
      type: "navigation.ready",
      workspaceId,
    }));
    return new Response(null, {
      headers: { "Sec-WebSocket-Protocol": NAVIGATION_REALTIME_PROTOCOL },
      status: 101,
      webSocket: client,
    });
  }

  publishInvalidation(event: NavigationRealtimeInvalidateEvent) {
    if (!isValidEvent(event)) throw new Error("Invalid navigation invalidation event");
    this.pruneExpiredSockets();
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      if (readAttachment(socket)?.claims.workspaceId === event.workspaceId) {
        socket.send(payload);
      }
    }
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4_096) {
      socket.close(1003, "Invalid navigation realtime message");
      return;
    }
    const attachment = readAttachment(socket);
    if (!attachment || attachment.claims.exp <= Date.now()) {
      socket.close(1008, "Navigation realtime ticket expired");
      return;
    }
    if (message !== PING) {
      socket.close(1003, "Unsupported navigation realtime message");
    }
  }

  webSocketClose() {}

  webSocketError(socket: WebSocket) {
    socket.close(1011, "Navigation realtime WebSocket error");
  }

  private pruneExpiredSockets() {
    for (const socket of this.ctx.getWebSockets()) {
      if ((readAttachment(socket)?.claims.exp ?? 0) <= Date.now()) {
        socket.close(1008, "Navigation realtime ticket expired");
      }
    }
  }
}

function readAttachment(socket: WebSocket) {
  const value = socket.deserializeAttachment() as SocketAttachment | null;
  return value?.claims ? value : null;
}

function isValidEvent(value: unknown): value is NavigationRealtimeInvalidateEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return event.type === "navigation.invalidate" &&
    event.protocolVersion === 1 &&
    typeof event.eventId === "string" && event.eventId.length > 0 &&
    typeof event.committedAt === "string" && event.committedAt.length > 0 &&
    typeof event.workspaceId === "string" && event.workspaceId.length > 0;
}
