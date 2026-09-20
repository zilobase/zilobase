import type { Server as HttpServer } from "node:http";
import type { MailNotificationEvent } from "../capabilities";
import {
  MAIL_REALTIME_AUTH_PROTOCOL_PREFIX,
  MAIL_REALTIME_PROTOCOL,
  verifyMailRealtimeTicket,
  type MailRealtimeTicketClaims,
  isMailFeatureEnabled,
  recordMailMetric,
  type RuntimeEnv,
} from "@zilobase/server/node-adapter-api";
import { attachNodeNotificationRuntime } from "./notification-runtime";
import { mailRealtimeChannel, type NodeRealtimeBus } from "./realtime-bus";

const PING = JSON.stringify({ type: "mail.ping" });
const PONG = JSON.stringify({ type: "mail.pong" });

export function attachNodeMailRealtimeRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: { realtimeBus?: NodeRealtimeBus | null } = {},
) {
  const runtime = attachNodeNotificationRuntime<MailRealtimeTicketClaims, MailNotificationEvent>(server, options.realtimeBus ?? null, {
    async authenticate(request) {
      const bindingId = new URL(request.url).searchParams.get("binding");
      const token = readTicket(request.headers);
      if (!bindingId || !token) throw new Response("Missing mail realtime ticket", { status: 401 });
      const claims = await verifyMailRealtimeTicket(token, env);
      if (claims.bindingId !== bindingId) throw new Response("Invalid mail realtime ticket", { status: 403 });
      return claims;
    },
    channel: mailRealtimeChannel,
    config: {
      encode: (event) => JSON.stringify({
        bindingId: event.bindingId,
        connectionId: event.connectionId,
        revision: event.revision,
        type: "mail.invalidate",
        workspaceId: event.workspaceId,
      }),
      errorReason: "Mail realtime error",
      expiredReason: "Mail realtime ticket expired",
      matches: () => true,
      ping: PING,
      pong: PONG,
      validate: (value): value is MailNotificationEvent => isNotification(value),
    },
    enabled: () => isMailFeatureEnabled(env),
    eventRoomId: (event) => event.bindingId,
    isRemoteEvent: (value, roomId): value is MailNotificationEvent =>
      isNotification(value) && value.bindingId === roomId,
    onClose: (claims, outcome) => recordMailMetric("socket_state", {
      connectionId: claims.connectionId,
      code: outcome,
      outcome: outcome === "error" ? "failure" : "success",
    }),
    onOpen: (claims) => recordMailMetric("socket_state", {
      connectionId: claims.connectionId,
      code: "open",
      outcome: "success",
    }),
    path: "/mail-realtime",
    protocol: MAIL_REALTIME_PROTOCOL,
    ready: () => JSON.stringify({ type: "mail.ready" }),
    roomId: (claims) => claims.bindingId,
  });
  return {
    destroy: runtime.destroy,
    async publishNotification(event: MailNotificationEvent) {
      if (isMailFeatureEnabled(env)) await runtime.publish(event);
    },
  };
}

function readTicket(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim());
  if (!protocols.includes(MAIL_REALTIME_PROTOCOL)) return null;
  return protocols.find((value) => value.startsWith(MAIL_REALTIME_AUTH_PROTOCOL_PREFIX))
    ?.slice(MAIL_REALTIME_AUTH_PROTOCOL_PREFIX.length) ?? null;
}

function isNotification(value: unknown): value is MailNotificationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.bindingId === "string" && typeof event.connectionId === "string" &&
    typeof event.workspaceId === "string" && Number.isSafeInteger(event.revision) &&
    (event.revision as number) >= 0;
}
