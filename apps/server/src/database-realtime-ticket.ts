import { Buffer } from "node:buffer";

import type { RuntimeEnv } from "./config";

const TICKET_TTL_MS = 30 * 60 * 1000;

export const DATABASE_REALTIME_PROTOCOL = "notelab.database.v1";
export const DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX =
  "notelab.database.auth.";

export type DatabaseRealtimeTicketClaims = {
  canEdit: boolean;
  databaseId: string;
  exp: number;
  sessionId: string;
  user: {
    email?: string | null;
    id: string;
    image?: string | null;
    name: string;
  };
  version?: number;
  workspaceId: string;
};

export async function createDatabaseRealtimeTicket(
  claims: Omit<
    DatabaseRealtimeTicketClaims,
    "exp" | "sessionId" | "version"
  > & {
    sessionId?: string;
    version: number;
  },
  env: RuntimeEnv,
) {
  const payload: DatabaseRealtimeTicketClaims = {
    ...claims,
    exp: Date.now() + TICKET_TTL_MS,
    sessionId: claims.sessionId ?? crypto.randomUUID(),
  };
  const encoded = encodeJson(payload);
  const signature = await sign(encoded, getTicketSecret(env));

  return {
    expiresAt: new Date(payload.exp).toISOString(),
    sessionId: payload.sessionId,
    token: `${encoded}.${signature}`,
  };
}

export async function verifyDatabaseRealtimeTicket(
  token: string,
  env: RuntimeEnv,
) {
  const [encoded, signature, extra] = token.split(".");

  if (!encoded || !signature || extra) {
    throw new Error("Invalid database realtime ticket");
  }

  if (!(await verify(encoded, signature, getTicketSecret(env)))) {
    throw new Error("Invalid database realtime ticket");
  }

  const claims = decodeJson(encoded);

  if (!isTicketClaims(claims) || claims.exp <= Date.now()) {
    throw new Error("Expired database realtime ticket");
  }

  return claims;
}

function getTicketSecret(env: RuntimeEnv) {
  const value = env.COLLABORATION_SECRET ?? env.BETTER_AUTH_SECRET;

  if (typeof value !== "string" || !value) {
    throw new Error("COLLABORATION_SECRET or BETTER_AUTH_SECRET is required");
  }

  return value;
}

async function sign(value: string, secret: string) {
  const key = await importSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return Buffer.from(signature).toString("base64url");
}

async function verify(value: string, signature: string, secret: string) {
  let signatureBytes: Uint8Array<ArrayBuffer>;

  try {
    signatureBytes = Uint8Array.from(Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }

  const key = await importSigningKey(secret, ["verify"]);

  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(value),
  );
}

function importSigningKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    usages,
  );
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function isTicketClaims(value: unknown): value is DatabaseRealtimeTicketClaims {
  if (!value || typeof value !== "object") return false;

  const claims = value as Record<string, unknown>;
  const ticketUser = claims.user;

  return (
    typeof claims.canEdit === "boolean" &&
    typeof claims.databaseId === "string" &&
    typeof claims.exp === "number" &&
    typeof claims.sessionId === "string" &&
    (claims.version === undefined ||
      (typeof claims.version === "number" && claims.version >= 0)) &&
    typeof claims.workspaceId === "string" &&
    Boolean(ticketUser) &&
    typeof ticketUser === "object" &&
    typeof (ticketUser as Record<string, unknown>).id === "string" &&
    typeof (ticketUser as Record<string, unknown>).name === "string"
  );
}
