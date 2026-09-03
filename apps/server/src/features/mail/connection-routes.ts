import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { gmailAccount, gmailWorkspaceConnection } from "../../infrastructure/database/schema";
import { getCanonicalWebOrigin } from "../../shared/config/config";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { getZilobaseDiscoveryDocument } from "../instance/service";
import { invalidateDatabaseAutomationDependencies } from "../databases/automations/service";
import { beginGmailOauth, completeGmailOauth, GmailOauthError, gmailProviderConfigured, revokeGmailConnection } from "./google-oauth";
import { clearGmailAccessTokenCache, createGmailGateway, GmailApiError } from "./gmail-gateway";
import { GmailPushError, processGmailPubsubRequest } from "./gmail-pubsub";
import { initializeGmailWatch } from "./gmail-watch";
import { recordMailMetric } from "./mail-metrics";
import { ensureMailIndexState } from "./mail-index";
import { oauthError, workspaceIdFromContext, requireWorkspaceMember, renderOauthResult, buildDesktopMailReturnUrl } from "./route-support";

export const mailConnectionRoutes = new Hono<AppBindings>();
export const mailProviderCallbackRoutes = new Hono<AppBindings>();

mailConnectionRoutes.get("/connection", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const workspaceId = workspaceIdFromContext(c)!
  const membership = await requireWorkspaceMember(c, workspaceId, user.id)
  if (membership instanceof Response) return membership
  const [result] = await db
    .select({ account: gmailAccount, binding: gmailWorkspaceConnection })
    .from(gmailWorkspaceConnection)
    .innerJoin(
      gmailAccount,
      eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id),
    )
    .where(and(
      eq(gmailWorkspaceConnection.workspaceId, workspaceId),
      eq(gmailWorkspaceConnection.userId, user.id),
    ))
    .limit(1)
  return c.json({
    accountId: result?.account.id ?? null,
    bindingId: result?.binding.id ?? null,
    connectionId: result?.account.id ?? null,
    email: result?.account.email ?? null,
    mailboxReady: Boolean(result),
    mailboxRevision: result?.account.mailboxRevision ?? 0,
    providerConfigured: gmailProviderConfigured(c.env),
    status: result?.account.status ?? "disconnected",
    watchExpiresAt: result?.account.watchExpiresAt?.toISOString() ?? null,
    workspaceId,
  })
})

mailConnectionRoutes.post("/oauth/start", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const workspaceId = workspaceIdFromContext(c)!
  const membership = await requireWorkspaceMember(c, workspaceId, user.id)
  if (membership instanceof Response) return membership
  if (!gmailProviderConfigured(c.env)) {
    return c.json({ message: "Gmail is not configured on this server." }, 503)
  }
  const body = (await readJsonBody(c.req, {})) as { client?: unknown }
  if (body.client !== "web" && body.client !== "desktop") {
    return c.json({ message: "A valid Gmail client is required." }, 400)
  }
  try {
    const authorizationUrl = await beginGmailOauth(c.env, {
      clientKind: body.client,
      userId: user.id,
      workspaceId,
    })
    await recordMailMetric("oauth_outcome", { outcome: "success" })
    return c.json({
      authorizationUrl,
    })
  } catch (error) {
    await recordMailMetric("oauth_outcome", { outcome: "failure" })
    return oauthError(c, error)
  }
})

mailProviderCallbackRoutes.get("/oauth/google/callback", async (c) => {
  c.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; navigate-to 'self' zilobase:")
  const state = c.req.query("state")
  const code = c.req.query("code")
  if (!state || !code || c.req.query("error")) {
    await recordMailMetric("oauth_outcome", { outcome: "failure" })
    return c.html(renderOauthResult("Gmail connection was cancelled."), 400)
  }
  try {
    const result = await runWithDbEnv(c.env, async () => {
      const completed = await completeGmailOauth(c.env, { code, state })
      await recordMailMetric("oauth_outcome", { connectionId: completed.connectionId, outcome: "success" })
      const [account] = await db
        .select()
        .from(gmailAccount)
        .where(eq(gmailAccount.id, completed.connectionId))
        .limit(1)
      if (account) {
        await ensureMailIndexState(account.id)
        await initializeGmailWatch(c.env, account).catch(async (error) => {
          await db
            .update(gmailAccount)
            .set({
              lastErrorCode: error instanceof GmailApiError ? error.code : "watch_failed",
              updatedAt: new Date(),
            })
            .where(eq(gmailAccount.id, account.id))
        })
      }
      return completed
    })
    if (result.clientKind === "desktop") {
      const discovery = await getZilobaseDiscoveryDocument(c.env)
      const deepLink = buildDesktopMailReturnUrl(discovery)
      return c.html(renderOauthResult("Gmail connected. Return to Zilobase Desktop.", deepLink.toString()))
    }
    const target = new URL("/mail?connection=success", getCanonicalWebOrigin(c.env))
    return c.redirect(target.toString())
  } catch (error) {
    await recordMailMetric("oauth_outcome", { outcome: "failure" })
    return c.html(
      renderOauthResult(error instanceof Error ? error.message : "Gmail could not be connected."),
      error instanceof GmailOauthError ? (error.status as 400) : 500,
    )
  }
})

mailConnectionRoutes.delete("/connection", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const workspaceId = workspaceIdFromContext(c)!
  const membership = await requireWorkspaceMember(c, workspaceId, user.id)
  if (membership instanceof Response) return membership
  const [binding] = await db
    .select({ account: gmailAccount, binding: gmailWorkspaceConnection })
    .from(gmailWorkspaceConnection)
    .innerJoin(
      gmailAccount,
      eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id),
    )
    .where(and(
      eq(gmailWorkspaceConnection.workspaceId, workspaceId),
      eq(gmailWorkspaceConnection.userId, user.id),
    ))
    .limit(1)
  if (binding) {
    await invalidateDatabaseAutomationDependencies({
      dependencyId: binding.account.id,
      dependencyType: "gmail_connection",
      reason: "The automation owner's Gmail account was disconnected",
      workspaceId,
    })
    await db
      .delete(gmailWorkspaceConnection)
      .where(eq(gmailWorkspaceConnection.id, binding.binding.id))
    const [remaining] = await db
      .select({ value: count() })
      .from(gmailWorkspaceConnection)
      .where(eq(gmailWorkspaceConnection.gmailAccountId, binding.account.id))
    if (Number(remaining?.value ?? 0) === 0) {
      try {
        await (await createGmailGateway(c.env, binding.account)).stop()
      } catch {
        // Local disconnect remains authoritative when Gmail is unavailable.
      }
      await revokeGmailConnection(c.env, binding.account)
      clearGmailAccessTokenCache(binding.account.id)
      await db.delete(gmailAccount).where(eq(gmailAccount.id, binding.account.id))
    }
  }
  return c.json({ success: true })
})

mailProviderCallbackRoutes.post("/google/pubsub", async (c) => {
  try {
    await processGmailPubsubRequest(c.env, c.req.raw)
    return c.body(null, 204)
  } catch (error) {
    const status = error instanceof GmailPushError ? error.status : 500
    await recordMailMetric("webhook_rejection", { status })
    return c.json(
      { message: error instanceof GmailPushError ? error.message : "Gmail push could not be processed." },
      status === 400 ? 400
        : status === 401 ? 401
          : status === 403 ? 403
            : status === 413 ? 413
              : status === 503 ? 503
                : 500,
    )
  }
})
