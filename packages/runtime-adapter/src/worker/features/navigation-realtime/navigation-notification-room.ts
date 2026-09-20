import { DurableObject } from "cloudflare:workers";
import {
  NAVIGATION_REALTIME_PROTOCOL,
  type NavigationRealtimeInvalidateEvent,
  type NavigationRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

import type { WorkerEnvBindings } from "../../adapter";
import { readNavigationRealtimeClaims } from "./security";
import { createNotificationRoom } from "@zilobase/features/runtime/notification-room";
import { createWorkerRoomHost, type WorkerRoomHost } from "../../room-host";
import { createWorkerTelemetry } from "../../telemetry";

type SocketAttachment = { claims: NavigationRealtimeTicketClaims };
const PING = JSON.stringify({ type: "realtime.ping" });
const PONG = JSON.stringify({ type: "realtime.pong" });

export class NavigationNotificationRoom extends DurableObject<WorkerEnvBindings> {
  private readonly host: WorkerRoomHost<SocketAttachment>;
  private readonly room: ReturnType<typeof createNotificationRoom<NavigationRealtimeTicketClaims, NavigationRealtimeInvalidateEvent>>;

  constructor(ctx: DurableObjectState, env: WorkerEnvBindings) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    this.host = createWorkerRoomHost(ctx);
    this.room = createNotificationRoom("navigation", {
      host: this.host,
      telemetry: createWorkerTelemetry({ env }),
    }, {
      encode: (event) => JSON.stringify(event),
      errorReason: "Navigation realtime WebSocket error",
      expiredReason: "Navigation realtime ticket expired",
      invalidEventReason: "Invalid navigation invalidation event",
      matches: (claims, event) => claims.workspaceId === event.workspaceId,
      ping: PING,
      pong: PONG,
      validate: isValidEvent,
    });
    void this.room.controller.start();
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
    const peer = this.host.accept(crypto.randomUUID(), request, server);
    peer.setAttachment({ claims });
    this.host.send(peer, JSON.stringify({
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
    this.room.publish(event);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    await this.host.messageEvent(socket, message);
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean) {
    await this.host.closeEvent(socket, { code, reason, wasClean });
  }

  async webSocketError(socket: WebSocket, error: unknown) {
    await this.host.errorEvent(socket, error);
  }

  private pruneExpiredSockets() {
    this.room.pruneExpired();
  }
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
