import "fake-indexeddb/auto"
import { IndexeddbPersistence } from "y-indexeddb"
import * as Y from "yjs"

export function register({ assert, loadModule, test }) {
  test("offline session fallback requires a matching owner, token, and unexpired session", async () => {
    const { isOfflineSessionAllowed } = await loadModule("/src/lib/offline-store.ts")
    const base = {
      accountId: "account-1",
      expiresAt: "2030-01-01T00:00:00.000Z",
      hasToken: true,
      now: Date.parse("2029-01-01T00:00:00.000Z"),
      ownerId: "account-1",
    }
    assert.equal(isOfflineSessionAllowed(base), true)
    assert.equal(isOfflineSessionAllowed({ ...base, ownerId: "account-2" }), false)
    assert.equal(isOfflineSessionAllowed({ ...base, hasToken: false }), false)
    assert.equal(isOfflineSessionAllowed({ ...base, now: Date.parse("2031-01-01") }), false)
  })

  test("query persistence only includes enabled and explicitly downloaded content", async () => {
    const { shouldPersistOfflineQueryForManifest } = await loadModule("/src/lib/offline-store.ts")
    const manifest = {
      accountId: "account-1",
      apiOrigin: "https://api.zilobase.test",
      items: [
        { availableAt: "now", id: "page-1", kind: "page", name: "Page", workspaceId: "workspace-1" },
        { availableAt: "now", id: "database-1", kind: "database", name: "DB", workspaceId: "workspace-1" },
      ],
      schemaVersion: 1,
      session: null,
      workspaces: [{ enabledAt: "now", id: "workspace-1", name: "Workspace", slug: "workspace" }],
    }
    const query = (queryKey, status = "success") => ({ queryKey, state: { status } })
    assert.equal(shouldPersistOfflineQueryForManifest(query(["page", "page-1"]), manifest), true)
    assert.equal(shouldPersistOfflineQueryForManifest(query(["page", "page-2"]), manifest), false)
    assert.equal(shouldPersistOfflineQueryForManifest(query(["database", "database-1", "full", "active-only"]), manifest), true)
    assert.equal(shouldPersistOfflineQueryForManifest(query(["integrations", "workspace-1"]), manifest), false)
    assert.equal(shouldPersistOfflineQueryForManifest(query(["ai", "conversation"]), manifest), false)
    assert.equal(shouldPersistOfflineQueryForManifest(query(["page", "page-1"], "error"), manifest), false)
  })

  test("Yjs edits survive IndexedDB document destruction and recreation", async () => {
    globalThis.window ??= globalThis
    const name = `offline-test-${crypto.randomUUID()}`
    const first = new Y.Doc()
    const firstPersistence = new IndexeddbPersistence(name, first)
    await waitForSynced(firstPersistence)
    first.getText("body").insert(0, "durable edit")
    await delay(20)
    firstPersistence.destroy()
    first.destroy()

    const second = new Y.Doc()
    const secondPersistence = new IndexeddbPersistence(name, second)
    await waitForSynced(secondPersistence)
    assert.equal(second.getText("body").toString(), "durable edit")
    await secondPersistence.clearData()
    secondPersistence.destroy()
    second.destroy()
  })

  test("local and remote Yjs updates converge", () => {
    const left = new Y.Doc()
    const right = new Y.Doc()
    left.getText("body").insert(0, "left")
    right.getText("body").insert(0, "right")
    Y.applyUpdate(left, Y.encodeStateAsUpdate(right))
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left))
    assert.equal(left.getText("body").toString(), right.getText("body").toString())
  })
}

function waitForSynced(persistence) {
  if (persistence.synced) return Promise.resolve()
  return new Promise((resolve) => persistence.once("synced", resolve))
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
