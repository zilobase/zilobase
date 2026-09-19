import {
  MAIL_REALTIME_AUTH_PROTOCOL_PREFIX,
  MAIL_REALTIME_PROTOCOL,
  isMailFeatureEnabled,
  verifyMailRealtimeTicket,
  type MailRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

const CLAIMS_HEADER = "x-zilobase-mail-realtime-claims";
const MAX_TICKET_BYTES = 8 * 1024;

export type MailRealtimeRouteEnv = Record<string, unknown> & {
  BETTER_AUTH_SECRET: string;
  COLLABORATION_SECRET?: string;
  MAIL_NOTIFICATION_ROOM?: {
    getByName(name: string): { fetch(request: Request): Promise<Response> };
  };
};

export async function routeMailRealtimeRequest(
  request: Request,
  env: MailRealtimeRouteEnv,
) {
  if (!isMailFeatureEnabled(env)) {
    return new Response("Not Found", { status: 404 });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const connectionId = new URL(request.url).searchParams.get("connection");
  if (!connectionId || connectionId.length > 512) {
    return new Response("Invalid Gmail connection", { status: 400 });
  }
  if (!env.MAIL_NOTIFICATION_ROOM) {
    return new Response("Mail realtime is unavailable", { status: 503 });
  }
  const ticket = readAuthenticationProtocol(request.headers);
  if (!ticket) {
    return new Response("Missing mail realtime ticket", { status: 401 });
  }
  try {
    const claims = await verifyMailRealtimeTicket(ticket, env);
    if (claims.connectionId !== connectionId) {
      throw new Error("Mail realtime ticket scope does not match");
    }
    const headers = new Headers(request.headers);
    headers.set(CLAIMS_HEADER, encodeURIComponent(JSON.stringify(claims)));
    return env.MAIL_NOTIFICATION_ROOM
      .getByName(claims.userId)
      .fetch(new Request(request, { headers }));
  } catch {
    return new Response("Invalid mail realtime ticket", { status: 401 });
  }
}

export function readMailRealtimeClaims(headers: Headers): MailRealtimeTicketClaims | null {
  const encoded = headers.get(CLAIMS_HEADER);
  if (!encoded) return null;
  try {
    const claims = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    return typeof claims.connectionId === "string" &&
        typeof claims.userId === "string" &&
        typeof claims.exp === "number"
      ? claims as MailRealtimeTicketClaims
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
    protocol.startsWith(MAIL_REALTIME_AUTH_PROTOCOL_PREFIX)
  );
  const ticket = authentication?.slice(MAIL_REALTIME_AUTH_PROTOCOL_PREFIX.length);
  return protocols.includes(MAIL_REALTIME_PROTOCOL) && ticket && ticket.length <= MAX_TICKET_BYTES
    ? ticket
    : null;
}
