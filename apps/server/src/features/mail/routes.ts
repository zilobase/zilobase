import { eq } from "drizzle-orm"
import { Hono, type Context } from "hono"

import { db } from "../../infrastructure/database"
import { gmailConnection } from "../../infrastructure/database/schema"
import { getCanonicalWebOrigin } from "../../shared/config/config"
import type { AppBindings } from "../../shared/types"
import { getZilobaseDiscoveryDocument } from "../instance/service"
import {
  beginGmailOauth,
  completeGmailOauth,
  GmailOauthError,
  gmailProviderConfigured,
  revokeGmailConnection,
} from "./google-oauth"

export const mailRoutes = new Hono<AppBindings>()

mailRoutes.get("/connection", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.userId, user.id))
    .limit(1)
  return c.json({
    connectionId: connection?.id ?? null,
    email: connection?.email ?? null,
    mailboxReady: false,
    mailboxRevision: connection?.mailboxRevision ?? 0,
    providerConfigured: gmailProviderConfigured(c.env),
    status: connection?.status ?? "disconnected",
    watchExpiresAt: connection?.watchExpiresAt?.toISOString() ?? null,
  })
})

mailRoutes.post("/oauth/start", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  if (!gmailProviderConfigured(c.env)) {
    return c.json({ message: "Gmail is not configured on this server." }, 503)
  }
  const body = (await c.req.json().catch(() => ({}))) as { client?: unknown }
  if (body.client !== "web" && body.client !== "desktop") {
    return c.json({ message: "A valid Gmail client is required." }, 400)
  }
  try {
    return c.json({
      authorizationUrl: await beginGmailOauth(c.env, {
        clientKind: body.client,
        userId: user.id,
      }),
    })
  } catch (error) {
    return oauthError(c, error)
  }
})

mailRoutes.get("/oauth/google/callback", async (c) => {
  const state = c.req.query("state")
  const code = c.req.query("code")
  if (!state || !code || c.req.query("error")) {
    return c.html(renderOauthResult("Gmail connection was cancelled."), 400)
  }
  try {
    const result = await completeGmailOauth(c.env, { code, state })
    if (result.clientKind === "desktop") {
      const discovery = await getZilobaseDiscoveryDocument(c.env)
      const deepLink = buildDesktopMailReturnUrl(discovery)
      return c.html(renderOauthResult("Gmail connected. Return to Zilobase Desktop.", deepLink.toString()))
    }
    const target = new URL("/mail?connection=success", getCanonicalWebOrigin(c.env))
    return c.redirect(target.toString())
  } catch (error) {
    return c.html(
      renderOauthResult(error instanceof Error ? error.message : "Gmail could not be connected."),
      error instanceof GmailOauthError ? (error.status as 400) : 500,
    )
  }
})

mailRoutes.delete("/connection", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.userId, user.id))
    .limit(1)
  if (connection) {
    await revokeGmailConnection(c.env, connection)
    await db.delete(gmailConnection).where(eq(gmailConnection.id, connection.id))
  }
  return c.json({ success: true })
})

function oauthError(c: Context<AppBindings>, error: unknown) {
  const status = error instanceof GmailOauthError ? error.status : 500
  return c.json(
    { message: error instanceof Error ? error.message : "Gmail could not be connected." },
    status === 400 ? 400 : 500,
  )
}

export function buildDesktopMailReturnUrl(input: {
  apiOrigin: string
  instanceId: string
}) {
  const deepLink = new URL("zilobase://open")
  deepLink.searchParams.set("instance", input.instanceId)
  deepLink.searchParams.set("path", "/mail?connection=success")
  deepLink.searchParams.set("server", input.apiOrigin)
  return deepLink
}

function renderOauthResult(message: string, deepLink?: string) {
  const escapedMessage = escapeHtml(message)
  const escapedLink = deepLink ? escapeHtml(deepLink) : null
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gmail connection</title></head><body><main><h1>Gmail connection</h1><p>${escapedMessage}</p>${escapedLink ? `<p><a href="${escapedLink}">Open Zilobase Desktop</a></p>` : ""}</main></body></html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
