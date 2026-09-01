import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("organization Mail renders persisted views separately from provider folders", async () => {
  const navigation = await readFile(
    new URL("../../../src/features/sidebar/components/workspace-mail-navigation.tsx", import.meta.url),
    "utf8",
  )
  const sidebar = await readFile(
    new URL("../../../src/features/sidebar/app-sidebar.tsx", import.meta.url),
    "utf8",
  )

  assert.match(sidebar, /activeTab\.id === "mail" && isFeatureEnabled\("mailOrganization"\)/)
  assert.match(navigation, /<SidebarGroupLabel>Views<\/SidebarGroupLabel>/)
  assert.match(navigation, /<SidebarGroupLabel>Mail<\/SidebarGroupLabel>/)
  assert.match(navigation, /mailSystemFolderIds\.map/)
  for (const label of ["All Mail", "Sent", "Drafts", "Spam", "Bin"]) {
    assert.ok(navigation.includes(`label: "${label}"`), `missing ${label}`)
  }
  assert.match(navigation, /<span>Add view<\/span>/)
  assert.match(navigation, /expanded \? "Less" : "More"/)
  assert.match(navigation, /DndContext[\s\S]*SortableContext/)
  assert.match(navigation, /threadsUnread/)
})

test("mail routing accepts persisted IDs and repairs unknown IDs to protected Inbox", async () => {
  const validator = await readFile(
    new URL("../../../src/app/routing/search-validators.ts", import.meta.url),
    "utf8",
  )
  const page = await readFile(
    new URL("../../../src/features/mail/pages/mail.tsx", import.meta.url),
    "utf8",
  )

  assert.match(validator, /typeof search\.view === "string" && search\.view\.trim\(\)/)
  assert.match(page, /persistedView\.protected/)
  assert.match(page, /if \(activePersistedView \|\| activeSystemFolder\) return/)
  assert.match(page, /search: \{ compose, view: inboxView\.id \}/)
})
