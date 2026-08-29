import type { RuntimeEnv } from "../../shared/config/config";

export const TICKET_TTL_MS = 5 * 60 * 1000;

export type PageCollaborationTicketClaims = {
  exp: number;
  pageId: string;
  scope: "comment" | "read-write" | "readonly";
  userId: string;
  workspaceId: string;
};

export type MeetingCollaborationTicketClaims = {
  exp: number;
  meetingId: string;
  scope: "read-write" | "readonly";
  userId: string;
  workspaceId: string;
};

export type CollaborationTicketClaims =
  | PageCollaborationTicketClaims
  | MeetingCollaborationTicketClaims;

export async function createCollaborationTicket(
  claims:
    | Omit<PageCollaborationTicketClaims, "exp">
    | Omit<MeetingCollaborationTicketClaims, "exp">,
  env: RuntimeEnv,
  options: { maxExpiresAt?: Date | null } = {},
) {
  const defaultExpiration = Date.now() + TICKET_TTL_MS;
  const payload: CollaborationTicketClaims = {
    ...claims,
    exp: options.maxExpiresAt
      ? Math.min(defaultExpiration, options.maxExpiresAt.getTime())
      : defaultExpiration,
  };

  if (payload.exp <= Date.now()) {
    throw new Error("Collaboration access has expired");
  }

  const encoded = encodeJson(payload);
  const signature = await sign(encoded, getTicketSecret(env));

  return {
    expiresAt: new Date(payload.exp).toISOString(),
    token: `${encoded}.${signature}`,
  };
}

export async function verifyCollaborationTicket(
  token: string,
  env: RuntimeEnv,
): Promise<CollaborationTicketClaims> {
  const [encoded, signature, extra] = token.split(".");

  if (!encoded || !signature || extra) {
    throw new Error("Invalid collaboration ticket");
  }

  const expected = await sign(encoded, getTicketSecret(env));

  if (!constantTimeEqual(signature, expected)) {
    throw new Error("Invalid collaboration ticket");
  }

  const claims = decodeJson(encoded);

  if (!isTicketClaims(claims) || claims.exp <= Date.now()) {
    throw new Error("Expired collaboration ticket");
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
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return Buffer.from(signature).toString("base64url");
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.subtle !== undefined
    ? timingSafeBytes(leftBytes, rightBytes)
    : false;
}

function timingSafeBytes(left: Buffer, right: Buffer) {
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function isTicketClaims(value: unknown): value is CollaborationTicketClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.exp === "number" &&
    ((typeof claims.pageId === "string" && claims.meetingId === undefined) ||
      (typeof claims.meetingId === "string" && claims.pageId === undefined)) &&
    (claims.scope === "comment" ||
      claims.scope === "read-write" ||
      claims.scope === "readonly") &&
    typeof claims.userId === "string" &&
    typeof claims.workspaceId === "string"
  );
}
