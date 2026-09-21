import type { Server as HttpServer } from "node:http";
import type { NavigationRealtimeInvalidateEvent } from "@zilobase/features/pages/navigation-realtime";
import { NAVIGATION_REALTIME_PING } from "@zilobase/features/pages/navigation-realtime";
import {
  NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX,
  NAVIGATION_REALTIME_PROTOCOL,
  verifyNavigationRealtimeTicket,
  type NavigationRealtimeTicketClaims,
  type RuntimeEnv,
} from "@zilobase/server/node-adapter-api";
import { attachNodeNotificationRuntime } from "../../notification-runtime";
import { navigationRealtimeChannel, type NodeRealtimeBus } from "../../realtime-bus";

const PONG = JSON.stringify({ type: "realtime.pong" });

export function attachNodeNavigationRealtimeRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: { realtimeBus?: NodeRealtimeBus | null } = {},
) {
  const runtime = attachNodeNotificationRuntime<NavigationRealtimeTicketClaims, NavigationRealtimeInvalidateEvent>(server, options.realtimeBus ?? null, {
    async authenticate(request) {
      const workspaceId = new URL(request.url).searchParams.get("workspace");
      const token = readTicket(request.headers);
      if (!workspaceId || !token) throw new Response("Missing navigation realtime ticket", { status: 401 });
      const claims = await verifyNavigationRealtimeTicket(token, env);
      if (claims.workspaceId !== workspaceId) throw new Response("Invalid navigation realtime ticket", { status: 403 });
      return claims;
    },
    channel: navigationRealtimeChannel,
    config: {
      encode: (event) => JSON.stringify(event),
      errorReason: "Navigation realtime error",
      expiredReason: "Navigation realtime ticket expired",
      invalidEventReason: "Invalid navigation invalidation event",
      matches: () => true,
      ping: NAVIGATION_REALTIME_PING,
      pong: PONG,
      validate: (value): value is NavigationRealtimeInvalidateEvent => isEvent(value),
    },
    eventRoomId: (event) => event.workspaceId,
    isRemoteEvent: (value, roomId): value is NavigationRealtimeInvalidateEvent =>
      isEvent(value) && value.workspaceId === roomId,
    path: "/navigation-realtime",
    protocol: NAVIGATION_REALTIME_PROTOCOL,
    ready: (claims) => JSON.stringify({
      protocolVersion: 1,
      sessionId: claims.sessionId,
      type: "navigation.ready",
      workspaceId: claims.workspaceId,
    }),
    roomId: (claims) => claims.workspaceId,
  });
  return { destroy: runtime.destroy, publish: runtime.publish };
}

function readTicket(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim());
  if (!protocols.includes(NAVIGATION_REALTIME_PROTOCOL)) return null;
  return protocols.find((value) => value.startsWith(NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX))
    ?.slice(NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX.length) ?? null;
}

function isEvent(value: unknown): value is NavigationRealtimeInvalidateEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return event.type === "navigation.invalidate" && event.protocolVersion === 1 &&
    typeof event.workspaceId === "string" && typeof event.eventId === "string" &&
    typeof event.committedAt === "string";
}
