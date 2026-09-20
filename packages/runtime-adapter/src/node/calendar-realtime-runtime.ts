import type { Server as HttpServer } from "node:http";
import type { CalendarNotificationEvent } from "../capabilities";
import {
  CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX,
  CALENDAR_REALTIME_PROTOCOL,
  verifyCalendarRealtimeTicket,
  type CalendarRealtimeTicketClaims,
  isCalendarFeatureEnabled,
  type RuntimeEnv,
} from "@zilobase/server/node-adapter-api";
import { attachNodeNotificationRuntime } from "./notification-runtime";
import { calendarRealtimeChannel, type NodeRealtimeBus } from "./realtime-bus";

const PING = JSON.stringify({ type: "calendar.ping" });
const PONG = JSON.stringify({ type: "calendar.pong" });

export function attachNodeCalendarRealtimeRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: { realtimeBus?: NodeRealtimeBus | null } = {},
) {
  const runtime = attachNodeNotificationRuntime<CalendarRealtimeTicketClaims, CalendarNotificationEvent>(server, options.realtimeBus ?? null, {
    async authenticate(request) {
      const bindingId = new URL(request.url).searchParams.get("binding");
      const token = readTicket(request.headers);
      if (!bindingId || !token) throw new Response("Missing calendar realtime ticket", { status: 401 });
      const claims = await verifyCalendarRealtimeTicket(token, env);
      if (claims.bindingId !== bindingId || !isCalendarFeatureEnabled(env, claims.workspaceId)) {
        throw new Response("Invalid calendar realtime ticket", { status: 403 });
      }
      return claims;
    },
    channel: calendarRealtimeChannel,
    config: {
      encode: (event) => JSON.stringify({
        bindingId: event.bindingId,
        calendarId: event.calendarId,
        generation: event.generation,
        revision: event.revision,
        type: "calendar.invalidate",
        workspaceId: event.workspaceId,
      }),
      errorReason: "Calendar realtime error",
      expiredReason: "Calendar realtime ticket expired",
      matches: (claims, event) => claims.workspaceId === event.workspaceId &&
        claims.userId === event.userId && claims.accountId === event.accountId,
      ping: PING,
      pong: PONG,
      validate: (value): value is CalendarNotificationEvent => isNotification(value),
    },
    enabled: () => isCalendarFeatureEnabled(env),
    eventRoomId: (event) => event.bindingId,
    isRemoteEvent: (value, roomId): value is CalendarNotificationEvent =>
      isNotification(value) && value.bindingId === roomId,
    path: "/calendar-realtime",
    protocol: CALENDAR_REALTIME_PROTOCOL,
    ready: () => JSON.stringify({ type: "calendar.ready" }),
    roomId: (claims) => claims.bindingId,
  });
  return {
    destroy: runtime.destroy,
    async publishNotification(event: CalendarNotificationEvent) {
      if (isCalendarFeatureEnabled(env)) await runtime.publish(event);
    },
  };
}

function readTicket(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim());
  if (!protocols.includes(CALENDAR_REALTIME_PROTOCOL)) return null;
  return protocols.find((value) => value.startsWith(CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX))
    ?.slice(CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX.length) ?? null;
}

function isNotification(value: unknown): value is CalendarNotificationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.bindingId === "string" && typeof event.accountId === "string" &&
    typeof event.calendarId === "string" && typeof event.userId === "string" &&
    typeof event.workspaceId === "string" && Number.isSafeInteger(event.generation) &&
    Number.isSafeInteger(event.revision) && (event.revision as number) >= 0;
}
