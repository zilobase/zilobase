import { Buffer } from "node:buffer"

import type { RuntimeEnv } from "../../shared/config/config"

const TICKET_TTL_MS = 5 * 60 * 1_000
export const MAIL_REALTIME_PROTOCOL = "zilobase.mail.v1"
export const MAIL_REALTIME_AUTH_PROTOCOL_PREFIX = "zilobase.mail.auth."

export type MailRealtimeTicketClaims = {
  connectionId: string
  exp: number
  userId: string
}

export async function createMailRealtimeTicket(
  claims: Omit<MailRealtimeTicketClaims, "exp">,
  env: RuntimeEnv,
) {
  const payload = { ...claims, exp: Date.now() + TICKET_TTL_MS }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = Buffer.from(await crypto.subtle.sign(
    "HMAC",
    await signingKey(env, ["sign"]),
    new TextEncoder().encode(encoded),
  )).toString("base64url")
  return { expiresAt: new Date(payload.exp).toISOString(), ticket: `${encoded}.${signature}` }
}

export async function verifyMailRealtimeTicket(token: string, env: RuntimeEnv) {
  if (!token || token.length > 4_096) throw new Error("Invalid mail realtime ticket")
  const [encoded, signature, extra] = token.split(".")
  if (!encoded || !signature || extra) throw new Error("Invalid mail realtime ticket")
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(env, ["verify"]),
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(encoded),
  )
  if (!valid) throw new Error("Invalid mail realtime ticket")
  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  } catch {
    throw new Error("Invalid mail realtime ticket")
  }
  if (!isClaims(claims) || claims.exp <= Date.now()) throw new Error("Expired mail realtime ticket")
  return claims
}

function signingKey(env: RuntimeEnv, usages: KeyUsage[]) {
  const secret = env.COLLABORATION_SECRET ?? env.BETTER_AUTH_SECRET
  if (typeof secret !== "string" || !secret) throw new Error("A realtime signing secret is required")
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    usages,
  )
}

function isClaims(value: unknown): value is MailRealtimeTicketClaims {
  if (!value || typeof value !== "object") return false
  const claims = value as Record<string, unknown>
  return typeof claims.connectionId === "string" && claims.connectionId.length <= 512 &&
    typeof claims.userId === "string" && claims.userId.length <= 512 &&
    typeof claims.exp === "number"
}
