import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const readMailRouteSources = async () => (await Promise.all([
  "routes.ts", "connection-routes.ts", "route-support.ts",
].map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n")

test("workspace rollout has no unscoped authenticated mail compatibility path", async () => {
  const [appRoutes, mailRoutes, config, types] = await Promise.all([
    readFile(new URL("../../app/routes.ts", import.meta.url), "utf8"),
    readMailRouteSources(),
    readFile(new URL("../../shared/config/config.ts", import.meta.url), "utf8"),
    readFile(new URL("../../shared/types.ts", import.meta.url), "utf8"),
  ])
  assert.match(appRoutes, /app\.route\("\/mail", mailProviderRoutes\)/)
  assert.match(appRoutes, /app\.route\("\/workspaces\/:workspaceId\/mail", mailRoutes\)/)
  assert.match(mailRoutes, /mailProviderCallbackRoutes\.get\("\/oauth\/google\/callback"/)
  assert.match(mailRoutes, /mailProviderCallbackRoutes\.post\("\/google\/pubsub"/)
  assert.doesNotMatch(mailRoutes, /gmailConnection/)
  assert.doesNotMatch(config, /LegacyMailRoutes|MAIL_LEGACY_ROUTES_ENABLED/)
  assert.doesNotMatch(types, /MAIL_LEGACY_ROUTES_ENABLED/)
})

test("workspace ownership gates every mailbox and permits identity reuse only through private bindings", async () => {
  const [routes, oauth, schema] = await Promise.all([
    readMailRouteSources(),
    readFile(new URL("./google-oauth.ts", import.meta.url), "utf8"),
    readFile(new URL("../../infrastructure/database/schema.ts", import.meta.url), "utf8"),
  ])
  assert.match(routes, /requireWorkspaceMember\(c, workspaceId, user\.id\)/)
  assert.match(routes, /eq\(gmailWorkspaceConnection\.workspaceId, workspaceId\)/)
  assert.match(routes, /eq\(gmailWorkspaceConnection\.userId, user\.id\)/)
  assert.match(routes, /eq\(gmailAccount\.userId, user\.id\)/)
  assert.match(oauth, /target: \[gmailAccount\.userId, gmailAccount\.googleSubject\]/)
  assert.match(oauth, /gmailWorkspaceConnection\.workspaceId,[\s\S]*gmailWorkspaceConnection\.userId/)
  assert.match(schema, /gmail_account_owner_subject_unique/)
  assert.match(schema, /gmail_workspace_connection_workspace_user_unique/)
  assert.doesNotMatch(schema, /export const gmailConnection/)
})

test("workspace rollout exposes maintenance for Node and alternate deployment adapters", async () => {
  const [coordinator, maintenance, adapter, realtime] = await Promise.all([
    readFile(new URL("../../app/node/background-coordinator.ts", import.meta.url), "utf8"),
    readFile(new URL("../../infrastructure/background/maintenance.ts", import.meta.url), "utf8"),
    readFile(new URL("../../public/adapter-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../../public/realtime-api.ts", import.meta.url), "utf8"),
  ])
  for (const operation of ["renewGmailWatches", "advancePendingMailIndexes", "drainMailDatabaseSyncOutbox"]) {
    assert.match(`${coordinator}\n${maintenance}`, new RegExp(`${operation}\\(env`))
    assert.match(adapter, new RegExp(operation))
  }
  assert.match(realtime, /verifyMailRealtimeTicket/)
  assert.match(realtime, /MailRealtimeTicketClaims/)
})

test("mail operational metrics cover indexing and database synchronization without mailbox content", async () => {
  const metrics = await readFile(new URL("./mail-metrics.ts", import.meta.url), "utf8")
  assert.match(metrics, /"database_sync"/)
  assert.match(metrics, /"index"/)
  assert.doesNotMatch(metrics, /subject|address|messageBody|bodyHtml|bodyText/)
})
