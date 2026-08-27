import "fake-indexeddb/auto"
import { IndexeddbPersistence } from "y-indexeddb"
import * as Y from "yjs"

export function register({ assert, loadModule, test }) {
  test("only local Yjs transactions mark an offline page dirty", async () => {
    const { shouldMarkOfflineDocumentDirty } = await loadModule(
      "/src/lib/offline-documents.ts",
    )
    const local = new Y.Doc()
    const remote = new Y.Doc()
    const transactionKinds = []
    local.on("update", (_update, _origin, _document, transaction) => {
      transactionKinds.push(shouldMarkOfflineDocumentDirty(transaction))
    })

    local.getText("body").insert(0, "local")
    remote.getText("body").insert(0, "remote")
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote))

    assert.deepEqual(transactionKinds, [true, false])
    local.destroy()
    remote.destroy()
  })

  test("offline manifest updates build on the latest in-memory state", async () => {
    const {
      clearAllOfflineData,
      enableOfflineWorkspace,
      getOfflineManifest,
      setOfflineItem,
    } = await loadModule("/src/lib/offline-store.ts")
    await clearAllOfflineData()

    await enableOfflineWorkspace({
      accountId: "account-1",
      session: {
        session: {
          expiresAt: "2030-01-01T00:00:00.000Z",
          id: "session-1",
          userId: "account-1",
        },
        user: {
          email: "person@example.com",
          emailVerified: true,
          hasPassword: true,
          id: "account-1",
          name: "Person",
        },
        validatedAt: "2029-01-01T00:00:00.000Z",
      },
      workspace: {
        id: "workspace-1",
        name: "Workspace",
        slug: "workspace",
      },
    })
    await setOfflineItem({
      availableAt: "2029-01-01T00:00:00.000Z",
      id: "page-1",
      kind: "page",
      name: "Page",
      workspaceId: "workspace-1",
    })

    const manifest = getOfflineManifest()
    assert.equal(manifest.workspaces.length, 1)
    assert.equal(manifest.workspaces[0].id, "workspace-1")
    assert.equal(manifest.items.length, 1)
    assert.equal(manifest.items[0].id, "page-1")
  })

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

  test("offline cache keys are scoped to a desktop instance", async () => {
    const { offlineManifestKey, offlineQueryCacheKey } = await loadModule(
      "/src/lib/offline-store.ts",
    )
    assert.equal(offlineManifestKey(), "zilobase-offline-manifest-v1")
    assert.equal(
      offlineManifestKey({
        apiOrigin: "https://notes.example.com",
        displayName: "Team Notes",
        instanceId: "instance-1",
        issuer: "https://notes.example.com",
        minimumDesktopVersion: "0.0.30",
        protocolVersion: 1,
        serverVersion: "0.0.30",
        webOrigin: "https://notes.example.com",
      }),
      "zilobase-offline-manifest-v1:instance-1",
    )
    assert.equal(
      offlineQueryCacheKey({
        apiOrigin: "https://notes.example.com",
        displayName: "Team Notes",
        instanceId: "instance-1",
        issuer: "https://notes.example.com",
        minimumDesktopVersion: "0.0.30",
        protocolVersion: 1,
        serverVersion: "0.0.30",
        webOrigin: "https://notes.example.com",
      }),
      "zilobase-offline-query-cache-v1:instance-1",
    )
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
    assert.equal(shouldPersistOfflineQueryForManifest(query(["billing", "workspace-1"]), manifest), false)
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

  test("server replacement deletes stale instance-scoped Yjs databases", async () => {
    globalThis.window ??= globalThis
    const { clearDesktopServerIndexedData } = await loadModule(
      "/src/lib/offline-store.ts",
    )
    const name = `zilobase:v1:stale:${crypto.randomUUID()}`
    const database = await openDatabase(name)
    database.close()

    await clearDesktopServerIndexedData()

    const names = (await indexedDB.databases()).map((entry) => entry.name)
    assert.equal(names.includes(name), false)
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

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.addEventListener("success", () => resolve(request.result))
    request.addEventListener("error", () => reject(request.error))
  })
}
