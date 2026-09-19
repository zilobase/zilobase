import { DurableObject } from "cloudflare:workers";
import {
  CALENDAR_REALTIME_PROTOCOL,
  type CalendarNotificationEvent,
  type CalendarRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

import type { WorkerEnvBindings } from "../../adapter";
import { readCalendarRealtimeClaims } from "./security";

type SocketAttachment = { claims: CalendarRealtimeTicketClaims };
const PING = JSON.stringify({ type: "calendar.ping" });
const PONG = JSON.stringify({ type: "calendar.pong" });

export class CalendarNotificationRoom extends DurableObject<WorkerEnvBindings> {
  constructor(ctx: DurableObjectState, env: WorkerEnvBindings) {
    super(ctx, env);

  }

  async fetch(request: Request) {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const bindingId = new URL(request.url).searchParams.get("binding");
    const claims = readCalendarRealtimeClaims(request.headers);
    if (!claims || claims.bindingId !== bindingId || claims.exp <= Date.now()) {
      return new Response("Unauthorized", { status: 401 });
    }
    this.pruneExpiredSockets();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ claims } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "calendar.ready" }));
    return new Response(null, {
      headers: { "Sec-WebSocket-Protocol": CALENDAR_REALTIME_PROTOCOL },
      status: 101,
      webSocket: client,
    });
  }

  publishNotification(event: CalendarNotificationEvent) {
    if (
      !event ||
      typeof event.bindingId !== "string" ||
      typeof event.calendarId !== "string" || !Number.isSafeInteger(event.generation) ||
      !Number.isSafeInteger(event.revision) ||
      event.revision < 0
    ) throw new Error("Invalid calendar notification event");
    this.pruneExpiredSockets();
    const payload = JSON.stringify({
      bindingId: event.bindingId,
      calendarId: event.calendarId,
      workspaceId: event.workspaceId,
      generation: event.generation,
      revision: event.revision,
      type: "calendar.invalidate",
    });
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = readAttachment(socket);
      if (attachment?.claims.bindingId === event.bindingId && attachment.claims.userId === event.userId && attachment.claims.workspaceId === event.workspaceId && attachment.claims.accountId === event.accountId) socket.send(payload);
    }
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4_096) {
      socket.close(1003, "Invalid calendar realtime message");
      return;
    }
    const attachment = readAttachment(socket);
    if (!attachment || attachment.claims.exp <= Date.now()) {
      socket.close(1008, "Calendar realtime ticket expired");
      return;
    }
    if (message === PING) socket.send(PONG);
    if (message !== PING) socket.close(1003, "Unsupported calendar realtime message");
  }

  webSocketClose() {}

  webSocketError(socket: WebSocket) {
    socket.close(1011, "Calendar realtime WebSocket error");
  }

  private pruneExpiredSockets() {
    for (const socket of this.ctx.getWebSockets()) {
      if ((readAttachment(socket)?.claims.exp ?? 0) <= Date.now()) {
        socket.close(1008, "Calendar realtime ticket expired");
      }
    }
  }
}

function readAttachment(socket: WebSocket) {
  const value = socket.deserializeAttachment() as SocketAttachment | null;
  return value?.claims ? value : null;
}
