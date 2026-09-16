import { Buffer } from "node:buffer";

import type { RuntimeEnv } from "../config/config";

const TICKET_TTL_MS = 30 * 60 * 1000;

export const DATA_SOURCE_REALTIME_PROTOCOL = "zilobase.database.v3";
export const DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX =
  "zilobase.database.auth.";

type RealtimeTicketUser = {
  email?: string | null;
  id: string;
  image?: string | null;
  name: string;
};

export type DataSourceRealtimeTicketClaims = {
  canEdit: boolean;
  exp: number;
  sessionId: string;
  sourceId: string;
  sourceVersion: number;
  user: RealtimeTicketUser;
  workspaceId: string;
};

export async function createDataSourceRealtimeTicket(
  claims: Omit<DataSourceRealtimeTicketClaims, "exp" | "sessionId"> & {
    sessionId?: string;
  },
  env: RuntimeEnv,
  options: { maxExpiresAt?: Date | null } = {},
) {
  const defaultExpiration = Date.now() + TICKET_TTL_MS;
  const payload: DataSourceRealtimeTicketClaims = {
    ...claims,
    exp: options.maxExpiresAt
      ? Math.min(defaultExpiration, options.maxExpiresAt.getTime())
      : defaultExpiration,
    sessionId: claims.sessionId ?? crypto.randomUUID(),
  };

  if (payload.exp <= Date.now()) {
    throw new Error("Data source realtime access has expired");
  }
  const encoded = encodeJson(payload);
  const signature = await sign(encoded, getTicketSecret(env));
  return {
    expiresAt: new Date(payload.exp).toISOString(),
    sessionId: payload.sessionId,
    token: `${encoded}.${signature}`,
  };
}

export async function verifyDataSourceRealtimeTicket(
  token: string,
  env: RuntimeEnv,
) {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) {
    throw new Error("Invalid data source realtime ticket");
  }
  if (!(await verify(encoded, signature, getTicketSecret(env)))) {
    throw new Error("Invalid data source realtime ticket");
  }
  const claims = decodeJson(encoded);
  if (!isDataSourceTicketClaims(claims) || claims.exp <= Date.now()) {
    throw new Error("Expired data source realtime ticket");
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
  const key = await importSigningKey(secret, ["verify"]);

  return crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(Buffer.from(signature, "base64url")),
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

function isDataSourceTicketClaims(
  value: unknown,
): value is DataSourceRealtimeTicketClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  const ticketUser = claims.user;
  return (
    typeof claims.canEdit === "boolean" &&
    typeof claims.exp === "number" &&
    typeof claims.sessionId === "string" &&
    typeof claims.sourceId === "string" &&
    typeof claims.sourceVersion === "number" &&
    Number.isSafeInteger(claims.sourceVersion) &&
    claims.sourceVersion >= 0 &&
    typeof claims.workspaceId === "string" &&
    Boolean(ticketUser) &&
    typeof ticketUser === "object" &&
    typeof (ticketUser as Record<string, unknown>).id === "string" &&
    typeof (ticketUser as Record<string, unknown>).name === "string"
  );
}
