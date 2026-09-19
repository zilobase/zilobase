import { getTableConfig } from "drizzle-orm/pg-core"
import * as schema from "../../infrastructure/database/schema"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { test } from "vitest"

const require = createRequire(import.meta.url)
const adapterNodeDir = path.dirname(require.resolve("@zilobase/runtime-adapter/node"))

const readMailRouteSources = async () => (await Promise.all([
  "routes.ts", "connections/routes.ts", "route-support.ts",
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
  const [routes, oauth] = await Promise.all([
    readMailRouteSources(),
    readFile(new URL("./provider/google-oauth.ts", import.meta.url), "utf8"),
  ])
  assert.match(routes, /requireWorkspaceMember\(c, workspaceId, user\.id\)/)
  assert.match(routes, /eq\(gmailWorkspaceConnection\.workspaceId, workspaceId\)/)
  assert.match(routes, /eq\(gmailWorkspaceConnection\.userId, user\.id\)/)
  assert.match(routes, /eq\(gmailAccount\.userId, user\.id\)/)
  assert.match(oauth, /target: \[gmailAccount\.userId, gmailAccount\.googleSubject\]/)
  assert.match(oauth, /gmailWorkspaceConnection\.workspaceId,[\s\S]*gmailWorkspaceConnection\.userId/)
  assert.ok(getTableConfig(schema.gmailAccount).indexes.some(index => index.config.name === "gmail_account_owner_subject_unique"))
  assert.ok(getTableConfig(schema.gmailWorkspaceConnection).indexes.some(index => index.config.name === "gmail_workspace_connection_workspace_user_unique"))
  assert.equal("gmailConnection" in schema, false)
})

test("workspace rollout exposes maintenance for Node and alternate deployment adapters", async () => {
  const [coordinator, maintenance, adapter, realtime] = await Promise.all([
    readFile(path.join(adapterNodeDir, "background-coordinator.ts"), "utf8"),
    readFile(new URL("../../app/background/maintenance.ts", import.meta.url), "utf8"),
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
