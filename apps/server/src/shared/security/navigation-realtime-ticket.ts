import { Buffer } from "node:buffer"
import type { RuntimeEnv } from "../config/config"
import {
  NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX,
  NAVIGATION_REALTIME_PROTOCOL,
} from "@zilobase/features/pages/navigation-realtime"

const TTL_MS = 30 * 60 * 1000
export { NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX, NAVIGATION_REALTIME_PROTOCOL }

export type NavigationRealtimeTicketClaims = {
  exp: number
  sessionId: string
  userId: string
  workspaceId: string
}

export async function createNavigationRealtimeTicket(
  claims: Omit<NavigationRealtimeTicketClaims, "exp" | "sessionId"> & { sessionId?: string },
  env: RuntimeEnv,
  options: { maxExpiresAt?: Date | null } = {},
) {
  const exp = Math.min(Date.now() + TTL_MS, options.maxExpiresAt?.getTime() ?? Infinity)
  if (exp <= Date.now()) throw new Error("Navigation realtime access has expired")
  const payload: NavigationRealtimeTicketClaims = {
    ...claims, exp, sessionId: claims.sessionId ?? crypto.randomUUID(),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = await sign(encoded, secret(env))
  return { expiresAt: new Date(exp).toISOString(), sessionId: payload.sessionId, token: `${encoded}.${signature}` }
}

export async function verifyNavigationRealtimeTicket(token: string, env: RuntimeEnv) {
  const [encoded, signature, extra] = token.split(".")
  if (!encoded || !signature || extra || !(await verify(encoded, signature, secret(env)))) {
    throw new Error("Invalid navigation realtime ticket")
  }
  const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>
  if (typeof value.exp !== "number" || value.exp <= Date.now() ||
    typeof value.sessionId !== "string" || typeof value.userId !== "string" ||
    typeof value.workspaceId !== "string") throw new Error("Expired navigation realtime ticket")
  return value as NavigationRealtimeTicketClaims
}

function secret(env: RuntimeEnv) {
  const value = env.COLLABORATION_SECRET ?? env.BETTER_AUTH_SECRET
  if (typeof value !== "string" || !value) throw new Error("COLLABORATION_SECRET or BETTER_AUTH_SECRET is required")
  return value
}
async function key(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { hash: "SHA-256", name: "HMAC" }, false, usages)
}
async function sign(value: string, secretValue: string) {
  return Buffer.from(await crypto.subtle.sign("HMAC", await key(secretValue, ["sign"]), new TextEncoder().encode(value))).toString("base64url")
}
async function verify(value: string, signature: string, secretValue: string) {
  return crypto.subtle.verify("HMAC", await key(secretValue, ["verify"]), Uint8Array.from(Buffer.from(signature, "base64url")), new TextEncoder().encode(value))
}
