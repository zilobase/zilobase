import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";

import { db } from "../../../infrastructure/database";
import { slackConnection } from "../../../infrastructure/database/schema";
import { getCanonicalWebOrigin, isAutomationSlackEnabled } from "../../../shared/config/config";
import type { AppBindings } from "../../../shared/types";
import { readJsonBody } from "../../../shared/http/request";
import { requireDatabaseRouteUser } from "../route-support";
import { requireDataSourceAccess } from "../access/data-source-access";
import { getDatabaseAutomationCatalog, invalidateDatabaseAutomationDependencies } from "./service";
import { beginSlackOauth, completeSlackOauth, listSlackChannels, SlackProviderError } from "./slack-provider";

export const automationSlackRoutes = new Hono<AppBindings>();
export const automationSlackProviderRoutes = new Hono<AppBindings>();

automationSlackRoutes.post("/:databaseId/automation-slack/oauth/start", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await readJsonBody(c.req) as { dataSourceId?: unknown } | null;
  if (!body || typeof body.dataSourceId !== "string") return c.json({ error: "dataSourceId is required" }, 400);
  try {
    const catalog = await getDatabaseAutomationCatalog({
      databaseId: c.req.param("databaseId"),
      dataSourceId: body.dataSourceId,
      slackEnabled: isAutomationSlackEnabled(c.env ?? {}),
      userId: user.id,
    });
    if (!catalog.canManage) return c.json({ error: catalog.manageUnavailableReason ?? "Forbidden" }, 403);
    const workspaceId = await connectionWorkspace(c.req.param("databaseId"), body.dataSourceId, user.id);
    return c.json({ authorizationUrl: await beginSlackOauth(c.env ?? {}, { userId: user.id, workspaceId }) });
  } catch (error) {
    return slackError(c, error);
  }
});

automationSlackRoutes.get("/:databaseId/automation-slack/connections/:connectionId/channels", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const dataSourceId = c.req.query("dataSourceId");
  if (!dataSourceId) return c.json({ error: "dataSourceId is required" }, 400);
  try {
    const catalog = await getDatabaseAutomationCatalog({
      databaseId: c.req.param("databaseId"), dataSourceId,
      slackEnabled: isAutomationSlackEnabled(c.env ?? {}), userId: user.id,
    });
    const allowed = catalog.slackConnections.find(({ id }) => id === c.req.param("connectionId"));
    if (!allowed) return c.json({ error: "Slack connection not found" }, 404);
    const [connection] = await db.select().from(slackConnection).where(and(
      eq(slackConnection.id, allowed.id),
      eq(slackConnection.ownerUserId, user.id),
    )).limit(1);
    if (!connection) return c.json({ error: "Slack connection not found" }, 404);
    return c.json({ channels: await listSlackChannels(c.env ?? {}, connection) });
  } catch (error) {
    if (error instanceof SlackProviderError && error.code === "SLACK_CONNECTION_REVOKED") {
      await db.update(slackConnection).set({ lastErrorCode: error.code, status: "revoked", updatedAt: new Date() }).where(and(
        eq(slackConnection.id, c.req.param("connectionId")), eq(slackConnection.ownerUserId, user.id),
      ));
      await invalidateDatabaseAutomationDependencies({
        dependencyId: c.req.param("connectionId"), dependencyType: "slack_connection",
        reason: "The automation owner's Slack connection was revoked",
      });
    }
    return slackError(c, error);
  }
});

automationSlackRoutes.delete("/:databaseId/automation-slack/connections/:connectionId", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const dataSourceId = c.req.query("dataSourceId");
  if (!dataSourceId) return c.json({ error: "dataSourceId is required" }, 400);
  const catalog = await getDatabaseAutomationCatalog({
    databaseId: c.req.param("databaseId"), dataSourceId,
    slackEnabled: isAutomationSlackEnabled(c.env ?? {}), userId: user.id,
  });
  if (!catalog.slackConnections.some(({ id }) => id === c.req.param("connectionId"))) return c.json({ error: "Slack connection not found" }, 404);
  await db.update(slackConnection).set({ lastErrorCode: "disconnected", status: "revoked", updatedAt: new Date() }).where(and(
    eq(slackConnection.id, c.req.param("connectionId")), eq(slackConnection.ownerUserId, user.id),
  ));
  await invalidateDatabaseAutomationDependencies({
    dependencyId: c.req.param("connectionId"), dependencyType: "slack_connection",
    reason: "The automation owner's Slack connection was disconnected",
  });
  return c.json({ disconnected: true });
});

automationSlackProviderRoutes.get("/automation-slack/oauth/callback", async (c) => {
  c.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  c.header("Cache-Control", "no-store, max-age=0");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || c.req.query("error")) return c.html(resultPage("Slack connection was cancelled"), 400);
  try {
    await completeSlackOauth(c.env ?? {}, { code, state });
    const target = new URL("/?automationSlack=connected", getCanonicalWebOrigin(c.env ?? {}));
    return c.redirect(target.toString());
  } catch (error) {
    return c.html(resultPage(error instanceof Error ? error.message : "Slack could not be connected"), error instanceof SlackProviderError ? error.status as 400 : 500);
  }
});

async function connectionWorkspace(databaseId: string, dataSourceId: string, userId: string) {
  const source = await requireDataSourceAccess(dataSourceId, userId, "full");
  if (source.parentDatabaseId !== databaseId) throw new SlackProviderError("Database source not found", "SOURCE_NOT_FOUND", 404);
  return source.workspaceId;
}

function slackError(c: Context<AppBindings>, error: unknown) {
  if (error instanceof SlackProviderError) return c.json(
    { error: error.message, code: error.code },
    error.status as 400 | 401 | 404 | 409 | 429 | 500 | 502 | 503 | 504,
  );
  return c.json({ error: error instanceof Error ? error.message : "Slack request failed" }, 500);
}

function resultPage(message: string) {
  const escaped = message.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return `<!doctype html><meta charset="utf-8"><title>Slack connection</title><p>${escaped}</p>`;
}
