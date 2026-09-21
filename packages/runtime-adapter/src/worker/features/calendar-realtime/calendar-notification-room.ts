import { DurableObject } from "cloudflare:workers";
import {
  CALENDAR_REALTIME_PROTOCOL,
  type CalendarNotificationEvent,
  type CalendarRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

import type { WorkerEnvBindings } from "../../bindings";
import { readCalendarRealtimeClaims } from "./security";
import { createNotificationRoom } from "@zilobase/features/runtime/notification-room";
import { createWorkerRoomHost, type WorkerRoomHost } from "../../room-host";
import { createWorkerTelemetry } from "../../telemetry";

type SocketAttachment = { claims: CalendarRealtimeTicketClaims };
const PING = JSON.stringify({ type: "calendar.ping" });
const PONG = JSON.stringify({ type: "calendar.pong" });

export class CalendarNotificationRoom extends DurableObject<WorkerEnvBindings> {
  private readonly host: WorkerRoomHost<SocketAttachment>;
  private readonly room: ReturnType<typeof createNotificationRoom<CalendarRealtimeTicketClaims, CalendarNotificationEvent>>;

  constructor(ctx: DurableObjectState, env: WorkerEnvBindings) {
    super(ctx, env);
    this.host = createWorkerRoomHost(ctx);
    this.room = createNotificationRoom("calendar", {
      host: this.host,
      telemetry: createWorkerTelemetry({ env }),
    }, {
      encode: (event) => JSON.stringify({
        bindingId: event.bindingId,
        calendarId: event.calendarId,
        generation: event.generation,
        revision: event.revision,
        type: "calendar.invalidate",
        workspaceId: event.workspaceId,
      }),
      errorReason: "Calendar realtime WebSocket error",
      expiredReason: "Calendar realtime ticket expired",
      matches: (claims, event) => claims.bindingId === event.bindingId &&
        claims.userId === event.userId && claims.workspaceId === event.workspaceId &&
        claims.accountId === event.accountId,
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
    const bindingId = new URL(request.url).searchParams.get("binding");
    const claims = readCalendarRealtimeClaims(request.headers);
    if (!claims || claims.bindingId !== bindingId || claims.exp <= Date.now()) {
      return new Response("Unauthorized", { status: 401 });
    }
    this.pruneExpiredSockets();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const peer = this.host.accept(crypto.randomUUID(), request, server);
    peer.setAttachment({ claims });
    this.host.send(peer, JSON.stringify({ type: "calendar.ready" }));
    return new Response(null, {
      headers: { "Sec-WebSocket-Protocol": CALENDAR_REALTIME_PROTOCOL },
      status: 101,
      webSocket: client,
    });
  }

  publishNotification(event: CalendarNotificationEvent) {
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

function isValidNotification(event: unknown): event is CalendarNotificationEvent {
  if (!event || typeof event !== "object") return false;
  const value = event as Record<string, unknown>;
  return typeof value.bindingId === "string" && typeof value.calendarId === "string" &&
    Number.isSafeInteger(value.generation) && Number.isSafeInteger(value.revision) &&
    (value.revision as number) >= 0;
}
