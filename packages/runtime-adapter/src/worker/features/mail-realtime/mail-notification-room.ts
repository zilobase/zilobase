import { DurableObject } from "cloudflare:workers";
import {
  MAIL_REALTIME_PROTOCOL,
  type MailNotificationEvent,
  type MailRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

import type { WorkerEnvBindings } from "../../adapter";
import { readMailRealtimeClaims } from "./security";

type SocketAttachment = { claims: MailRealtimeTicketClaims };
const PING = JSON.stringify({ type: "mail.ping" });
const PONG = JSON.stringify({ type: "mail.pong" });

export class MailNotificationRoom extends DurableObject<WorkerEnvBindings> {
  constructor(ctx: DurableObjectState, env: WorkerEnvBindings) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
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
    server.serializeAttachment({ claims } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "mail.ready" }));
    return new Response(null, {
      headers: { "Sec-WebSocket-Protocol": MAIL_REALTIME_PROTOCOL },
      status: 101,
      webSocket: client,
    });
  }

  publishNotification(event: MailNotificationEvent) {
    if (
      !event ||
      typeof event.connectionId !== "string" ||
      !Number.isSafeInteger(event.revision) ||
      event.revision < 0
    ) throw new Error("Invalid mail notification event");
    this.pruneExpiredSockets();
    const payload = JSON.stringify({
      connectionId: event.connectionId,
      revision: event.revision,
      type: "mail.invalidate",
    });
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = readAttachment(socket);
      if (attachment?.claims.connectionId === event.connectionId) socket.send(payload);
    }
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4_096) {
      socket.close(1003, "Invalid mail realtime message");
      return;
    }
    const attachment = readAttachment(socket);
    if (!attachment || attachment.claims.exp <= Date.now()) {
      socket.close(1008, "Mail realtime ticket expired");
      return;
    }
    if (message !== PING) socket.close(1003, "Unsupported mail realtime message");
  }

  webSocketClose() {}

  webSocketError(socket: WebSocket) {
    socket.close(1011, "Mail realtime WebSocket error");
  }

  private pruneExpiredSockets() {
    for (const socket of this.ctx.getWebSockets()) {
      if ((readAttachment(socket)?.claims.exp ?? 0) <= Date.now()) {
        socket.close(1008, "Mail realtime ticket expired");
      }
    }
  }
}

function readAttachment(socket: WebSocket) {
  const value = socket.deserializeAttachment() as SocketAttachment | null;
  return value?.claims ? value : null;
}
