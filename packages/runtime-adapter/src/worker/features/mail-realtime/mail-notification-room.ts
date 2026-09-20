import { DurableObject } from "cloudflare:workers";
import {
  MAIL_REALTIME_PROTOCOL,
  type MailNotificationEvent,
  type MailRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

import type { WorkerEnvBindings } from "../../adapter";
import { readMailRealtimeClaims } from "./security";
import { createNotificationRoom } from "@zilobase/features/runtime/notification-room";
import { createWorkerRoomHost, type WorkerRoomHost } from "../../room-host";
import { createWorkerTelemetry } from "../../telemetry";

type SocketAttachment = { claims: MailRealtimeTicketClaims };
const PING = JSON.stringify({ type: "mail.ping" });
const PONG = JSON.stringify({ type: "mail.pong" });

export class MailNotificationRoom extends DurableObject<WorkerEnvBindings> {
  private readonly host: WorkerRoomHost<SocketAttachment>;
  private readonly room: ReturnType<typeof createNotificationRoom<MailRealtimeTicketClaims, MailNotificationEvent>>;

  constructor(ctx: DurableObjectState, env: WorkerEnvBindings) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    this.host = createWorkerRoomHost(ctx);
    this.room = createNotificationRoom("mail", {
      host: this.host,
      telemetry: createWorkerTelemetry({ env }),
    }, {
      encode: (event) => JSON.stringify({
        connectionId: event.connectionId,
        revision: event.revision,
        type: "mail.invalidate",
      }),
      errorReason: "Mail realtime WebSocket error",
      expiredReason: "Mail realtime ticket expired",
      matches: (claims, event) => claims.connectionId === event.connectionId,
      ping: PING,
      pong: PONG,
      validate: isValidNotification,
    });
    void this.room.controller.start();
  }

  async fetch(request: Request) {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const connectionId = new URL(request.url).searchParams.get("connection");
    const claims = readMailRealtimeClaims(request.headers);
    if (!claims || claims.connectionId !== connectionId || claims.exp <= Date.now()) {
      return new Response("Unauthorized", { status: 401 });
    }
    this.pruneExpiredSockets();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const peer = this.host.accept(crypto.randomUUID(), request, server);
    peer.setAttachment({ claims });
    this.host.send(peer, JSON.stringify({ type: "mail.ready" }));
    return new Response(null, {
      headers: { "Sec-WebSocket-Protocol": MAIL_REALTIME_PROTOCOL },
      status: 101,
      webSocket: client,
    });
  }

  publishNotification(event: MailNotificationEvent) {
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

function isValidNotification(event: unknown): event is MailNotificationEvent {
  if (!event || typeof event !== "object") return false;
  const value = event as Record<string, unknown>;
  return typeof value.connectionId === "string" && Number.isSafeInteger(value.revision) &&
    (value.revision as number) >= 0;
}
