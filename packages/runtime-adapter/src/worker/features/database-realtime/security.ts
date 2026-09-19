import {
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
  verifyDatabaseRealtimeTicket,
  type DatabaseRealtimeTicketClaims,
} from "@zilobase/server/realtime-api";

export const MAX_DATABASE_REALTIME_MESSAGE_BYTES = 16 * 1024;
const DATABASE_REALTIME_CLAIMS_HEADER =
  "x-zilobase-database-realtime-claims";
const MAX_TICKET_BYTES = 8 * 1024;

export type DatabaseRealtimeRouteEnv = Record<string, unknown> & {
  BETTER_AUTH_SECRET: string;
  COLLABORATION_SECRET?: string;
  COLLABORATION_RATE_LIMITER: Pick<RateLimit, "limit">;
  DATABASE_COLLABORATION: {
    getByName(name: string): {
      fetch(request: Request): Promise<Response>;
    };
  };
};

export async function routeDatabaseRealtimeRequest(
  request: Request,
  env: DatabaseRealtimeRouteEnv,
) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }

  const databaseId = new URL(request.url).searchParams.get("database");

  if (!databaseId || databaseId.length > 128) {
    return new Response("Invalid database", { status: 400 });
  }

  const clientAddress = request.headers.get("cf-connecting-ip") ?? "local";

  const { success } = await env.COLLABORATION_RATE_LIMITER.limit({
    key: `database-realtime-connect:${clientAddress}`,
  });

  if (!success) {
    console.warn(JSON.stringify({
      databaseId,
      event: "database_realtime_connection_rate_limited",
      clientAddress,
    }));
    return new Response("Too Many Requests", {
      headers: { "Retry-After": "60" },
      status: 429,
    });
  }

  const authentication = readAuthenticationProtocol(request.headers);

  if (!authentication) {
    return new Response("Missing database realtime ticket", { status: 401 });
  }

  try {
    const claims = await verifyDatabaseRealtimeTicket(
      authentication.token,
      env,
    );

    if (claims.databaseId !== databaseId) {
      throw new Error("Database realtime ticket scope does not match");
    }

    const userRateLimit = await env.COLLABORATION_RATE_LIMITER.limit({
      key: `database-realtime-user:${claims.user.id}:${databaseId}`,
    });

    if (!userRateLimit.success) {
      return new Response("Too Many Requests", {
        headers: { "Retry-After": "60" },
        status: 429,
      });
    }

    const headers = new Headers(request.headers);
    headers.set(
      DATABASE_REALTIME_CLAIMS_HEADER,
      encodeURIComponent(JSON.stringify(claims)),
    );

    return env.DATABASE_COLLABORATION
      .getByName(databaseId)
      .fetch(new Request(request, { headers }));
  } catch (error) {
    console.warn(JSON.stringify({
      databaseId,
      error: error instanceof Error ? error.message : String(error),
      event: "database_realtime_upgrade_authentication_failed",
    }));
    return new Response("Invalid database realtime ticket", { status: 401 });
  }
}

export function readDatabaseRealtimeClaims(
  headers: Headers,
): DatabaseRealtimeTicketClaims | null {
  const encoded = headers.get(DATABASE_REALTIME_CLAIMS_HEADER);

  if (!encoded) return null;

  try {
    const value = JSON.parse(decodeURIComponent(encoded)) as unknown;

    return isTicketClaims(value) ? value : null;
  } catch {
    return null;
  }
}

function readAuthenticationProtocol(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((protocol) => protocol.trim());
  const authentication = protocols.find((protocol) =>
    protocol.startsWith(DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX)
  );
  const token = authentication?.slice(
    DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX.length,
  );

  return protocols.includes(DATABASE_REALTIME_PROTOCOL) &&
      token && token.length <= MAX_TICKET_BYTES
    ? { token }
    : null;
}

function isTicketClaims(
  value: unknown,
): value is DatabaseRealtimeTicketClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;

  return (
    typeof claims.canEdit === "boolean" &&
    typeof claims.databaseId === "string" &&
    typeof claims.exp === "number" &&
    typeof claims.sessionId === "string" &&
    typeof claims.user === "object" && claims.user !== null &&
    typeof (claims.user as Record<string, unknown>).id === "string" &&
    typeof claims.workspaceId === "string"
  );
}

export function validateDatabaseRealtimeMessage(
  rawMessage: string | ArrayBuffer,
) {
  if (typeof rawMessage !== "string") {
    return { code: 1003, ok: false as const, reason: "JSON messages are required" };
  }

  const messageBytes = new TextEncoder().encode(rawMessage).byteLength;

  if (messageBytes > MAX_DATABASE_REALTIME_MESSAGE_BYTES) {
    return {
      code: 1009,
      ok: false as const,
      reason: "Database realtime message is too large",
    };
  }

  try {
    const value = JSON.parse(rawMessage) as unknown;

    return value && typeof value === "object"
      ? { message: value as Record<string, unknown>, ok: true as const }
      : { code: 1007, ok: false as const, reason: "Invalid JSON message" };
  } catch {
    return { code: 1007, ok: false as const, reason: "Invalid JSON message" };
  }
}
