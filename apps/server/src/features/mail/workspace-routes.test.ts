import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

test("workspace mail routes are mounted beside flagged legacy routes", async () => {
  const routes = await readFile(
    new URL("../../app/routes.ts", import.meta.url),
    "utf8",
  )
  const config = await readFile(
    new URL("../../shared/config/config.ts", import.meta.url),
    "utf8",
  )

  assert.match(routes, /app\.route\("\/workspaces\/:workspaceId\/mail", mailRoutes\)/)
  assert.match(routes, /app\.route\("\/mail", mailRoutes\)/)
  assert.match(config, /isLegacyMailRoutesEnabled/)
  assert.match(config, /MAIL_LEGACY_ROUTES_ENABLED/)
})

test("workspace connection resolution checks membership and account ownership", async () => {
  const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8")

  assert.match(routes, /requireWorkspaceMember\(c, workspaceId, user\.id\)/)
  assert.match(routes, /eq\(gmailWorkspaceConnection\.workspaceId, workspaceId\)/)
  assert.match(routes, /eq\(gmailWorkspaceConnection\.userId, user\.id\)/)
  assert.match(routes, /eq\(gmailAccount\.userId, user\.id\)/)
})

test("workspace OAuth reuses identities and binds state to a workspace", async () => {
  const oauth = await readFile(
    new URL("./google-oauth.ts", import.meta.url),
    "utf8",
  )

  assert.match(oauth, /workspaceId: input\.workspaceId/)
  assert.match(oauth, /eq\(gmailAccount\.googleSubject, identity\.subject\)/)
  assert.match(
    oauth,
    /target: \[gmailAccount\.userId, gmailAccount\.googleSubject\]/,
  )
  assert.match(oauth, /insert\(gmailWorkspaceConnection\)/)
  assert.match(
    oauth,
    /gmailWorkspaceConnection\.workspaceId,[\s\S]*gmailWorkspaceConnection\.userId/,
  )
})

test("disconnect revokes only after the final workspace binding", async () => {
  const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8")
  const disconnect = routes.slice(
    routes.indexOf('mailRoutes.delete("/connection"'),
    routes.indexOf('mailRoutes.post("/google/pubsub"'),
  )

  assert.match(disconnect, /delete\(gmailWorkspaceConnection\)/)
  assert.match(disconnect, /count\(\)/)
  assert.match(disconnect, /Number\(remaining\?\.value \?\? 0\) === 0/)
  assert.match(disconnect, /revokeGmailConnection\(c\.env, binding\.account\)/)
  assert.match(disconnect, /delete\(gmailAccount\)/)
})
