import {
  NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX,
  NAVIGATION_REALTIME_PROTOCOL,
  verifyNavigationRealtimeTicket,
  type NavigationRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

const CLAIMS_HEADER = "x-zilobase-navigation-realtime-claims";
const MAX_TICKET_BYTES = 8 * 1024;
const MAX_WORKSPACE_ID_BYTES = 512;

export type NavigationRealtimeRouteEnv = Record<string, unknown> & {
  BETTER_AUTH_SECRET: string;
  COLLABORATION_SECRET?: string;
  NAVIGATION_NOTIFICATION_ROOM?: {
    getByName(name: string): { fetch(request: Request): Promise<Response> };
  };
};

export async function routeNavigationRealtimeRequest(
  request: Request,
  env: NavigationRealtimeRouteEnv,
) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const workspaceId = new URL(request.url).searchParams.get("workspace");
  if (!workspaceId || workspaceId.length > MAX_WORKSPACE_ID_BYTES) {
    return new Response("Invalid workspace", { status: 400 });
  }
  if (!env.NAVIGATION_NOTIFICATION_ROOM) {
    return new Response("Navigation realtime is unavailable", { status: 503 });
  }
  const ticket = readAuthenticationProtocol(request.headers);
  if (!ticket) {
    return new Response("Missing navigation realtime ticket", { status: 401 });
  }
  try {
    const claims = await verifyNavigationRealtimeTicket(ticket, env);
    if (claims.workspaceId !== workspaceId) {
      throw new Error("Navigation realtime ticket scope does not match");
    }
    const headers = new Headers(request.headers);
    headers.set(CLAIMS_HEADER, encodeURIComponent(JSON.stringify(claims)));
    return env.NAVIGATION_NOTIFICATION_ROOM
      .getByName(workspaceId)
      .fetch(new Request(request, { headers }));
  } catch {
    return new Response("Invalid navigation realtime ticket", { status: 401 });
  }
}

export function readNavigationRealtimeClaims(
  headers: Headers,
): NavigationRealtimeTicketClaims | null {
  const encoded = headers.get(CLAIMS_HEADER);
  if (!encoded) return null;
  try {
    const claims = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    return typeof claims.exp === "number" &&
        typeof claims.sessionId === "string" &&
        typeof claims.userId === "string" &&
        typeof claims.workspaceId === "string"
      ? claims as NavigationRealtimeTicketClaims
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
    protocol.startsWith(NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX)
  );
  const ticket = authentication?.slice(NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX.length);
  return protocols.includes(NAVIGATION_REALTIME_PROTOCOL) &&
      ticket && ticket.length <= MAX_TICKET_BYTES
    ? ticket
    : null;
}
