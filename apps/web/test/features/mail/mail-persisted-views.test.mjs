import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("Mail bootstraps persisted views for the active workspace binding", async () => {
  const hook = await readFile(
    new URL("../../../src/features/mail/model/use-mail-views.ts", import.meta.url),
    "utf8",
  )
  const page = await readFile(
    new URL("../../../src/features/mail/pages/mail.tsx", import.meta.url),
    "utf8",
  )

  assert.match(hook, /mailApiBasePath\(input\.workspaceId\)/)
  assert.match(hook, /\$\{mailBasePath\}\/views/)
  assert.match(hook, /input\.workspaceId, input\.bindingId/)
  assert.match(page, /useMailViews\(\{/)
  assert.match(page, /enabled: isFeatureEnabled\("mailOrganization"\)/)
})

test("Mail advances bounded index work and reports progress", async () => {
  const page = await readFile(
    new URL("../../../src/features/mail/pages/mail.tsx", import.meta.url),
    "utf8",
  )

  assert.match(page, /\/index\/advance/)
  assert.match(page, /Indexing full mailbox…/)
  assert.match(page, /indexProgress\.indexedThreadCount/)
  assert.match(page, /Mail indexing paused/)
})
