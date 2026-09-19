import {
  CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX,
  CALENDAR_REALTIME_PROTOCOL,
  isCalendarFeatureEnabled,
  verifyCalendarRealtimeTicket,
  type CalendarRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

const CLAIMS_HEADER = "x-zilobase-calendar-realtime-claims";
const MAX_TICKET_BYTES = 8 * 1024;

export type CalendarRealtimeRouteEnv = Record<string, unknown> & {
  BETTER_AUTH_SECRET: string;
  COLLABORATION_SECRET?: string;
  CALENDAR_NOTIFICATION_ROOM?: {
    getByName(name: string): { fetch(request: Request): Promise<Response> };
  };
};

export async function routeCalendarRealtimeRequest(
  request: Request,
  env: CalendarRealtimeRouteEnv,
) {
  if (!isCalendarFeatureEnabled(env)) {
    return new Response("Not Found", { status: 404 });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const bindingId = new URL(request.url).searchParams.get("binding");
  if (!bindingId || bindingId.length > 512) {
    return new Response("Invalid Gcalendar connection", { status: 400 });
  }
  if (!env.CALENDAR_NOTIFICATION_ROOM) {
    return new Response("Calendar realtime is unavailable", { status: 503 });
  }
  const ticket = readAuthenticationProtocol(request.headers);
  if (!ticket) {
    return new Response("Missing calendar realtime ticket", { status: 401 });
  }
  try {
    const claims = await verifyCalendarRealtimeTicket(ticket, env);
    if (claims.bindingId !== bindingId || !isCalendarFeatureEnabled(env, claims.workspaceId)) {
      throw new Error("Calendar realtime ticket scope does not match");
    }
    const headers = new Headers(request.headers);
    headers.set(CLAIMS_HEADER, encodeURIComponent(JSON.stringify(claims)));
    return env.CALENDAR_NOTIFICATION_ROOM
      .getByName(claims.bindingId)
      .fetch(new Request(request, { headers }));
  } catch {
    return new Response("Invalid calendar realtime ticket", { status: 401 });
  }
}

export function readCalendarRealtimeClaims(headers: Headers): CalendarRealtimeTicketClaims | null {
  const encoded = headers.get(CLAIMS_HEADER);
  if (!encoded) return null;
  try {
    const claims = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    return typeof claims.bindingId === "string" &&
        typeof claims.userId === "string" && typeof claims.workspaceId === "string" && typeof claims.accountId === "string" &&
        typeof claims.exp === "number"
      ? claims as CalendarRealtimeTicketClaims
      : null;
  } catch {
    return null;
  }
}

function readAuthenticationProtocol(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((protocol) => protocol.trim());
  const authentication = protocols.find((protocol) =>
    protocol.startsWith(CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX)
  );
  const ticket = authentication?.slice(CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX.length);
  return protocols.includes(CALENDAR_REALTIME_PROTOCOL) && ticket && ticket.length <= MAX_TICKET_BYTES
    ? ticket
    : null;
}
