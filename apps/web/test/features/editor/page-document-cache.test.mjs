import "fake-indexeddb/auto";
import * as Y from "yjs";

export function register({ assert, loadModule, test }) {
  test("page documents share one instance and persist updates before release", async () => {
    const cache = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    const first = await cache.acquirePageDocument("cache-user-1", "cache-page-1");
    const second = await cache.acquirePageDocument("cache-user-1", "cache-page-1");

    assert.equal(first.document, second.document);
    first.document.getText("body").insert(0, "hello");
    await first.flush();
    assert.equal(first.pendingWrites, 0);
    assert.equal(first.persistenceError, null);
    assert.equal(first.hasPersistedState, true);

    cache.releasePageDocument(first);
    cache.releasePageDocument(second);
    await cache.clearPageCacheForUser("cache-user-1");
    const empty = await cache.acquirePageDocument("cache-user-1", "cache-page-1");
    assert.equal(empty.document.getText("body").toString(), "");
    cache.releasePageDocument(empty);
    await cache.clearPageCacheForUser("cache-user-1");
  });

  test("a clean cached document rehydrates after its memory entry is dropped", async () => {
    const cache = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    const first = await cache.acquirePageDocument("cache-user-2", "cache-page-2");
    first.document.transact(
      () => first.document.getText("body").insert(0, "cached"),
      "page-bootstrap",
    );
    await first.flush();
    cache.releasePageDocument(first);

    assert.equal(await cache.dropIdlePageDocument("cache-user-2", "cache-page-2"), true);
    const second = await cache.acquirePageDocument("cache-user-2", "cache-page-2");
    assert.notEqual(second.document, first.document);
    assert.equal(second.document.getText("body").toString(), "cached");
    cache.releasePageDocument(second);
    await cache.clearPageCacheForUser("cache-user-2");
  });

  test("local changes survive compaction and become evictable only after server verification", async () => {
    const cache = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    const entry = await cache.acquirePageDocument("cache-user-3", "cache-page-3");
    for (let index = 0; index < 120; index += 1) {
      entry.document.getText("body").insert(index, "x");
    }
    await entry.flush();
    assert.equal(entry.locallyChanged, true);

    const oldServer = new Y.Doc();
    assert.equal(
      cache.pageDocumentContainsUnsavedChanges(entry, Y.encodeStateAsUpdate(oldServer)),
      true,
    );
    assert.equal(
      await cache.verifyPageDocumentSaved(entry, Y.encodeStateAsUpdate(oldServer)),
      false,
    );
    const currentServer = new Y.Doc();
    Y.applyUpdate(currentServer, Y.encodeStateAsUpdate(entry.document));
    assert.equal(
      await cache.verifyPageDocumentSaved(entry, Y.encodeStateAsUpdate(currentServer)),
      true,
    );
    assert.equal(entry.locallyChanged, false);

    cache.releasePageDocument(entry);
    assert.equal(await cache.dropIdlePageDocument("cache-user-3", "cache-page-3"), true);
    const reloaded = await cache.acquirePageDocument("cache-user-3", "cache-page-3");
    assert.equal(reloaded.document.getText("body").toString(), "x".repeat(120));
    cache.releasePageDocument(reloaded);
    await cache.clearPageCacheForUser("cache-user-3");
    oldServer.destroy();
    currentServer.destroy();
  });

  test("revoked page detail is hidden while its Yjs recovery state remains available", async () => {
    const cache = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    const entry = await cache.acquirePageDocument("cache-user-4", "cache-page-4");
    entry.document.getText("body").insert(0, "recover me");
    await entry.flush();
    await cache.rememberPageDetail(entry, { page: { id: "cache-page-4" } }, "workspace");
    assert.ok(await cache.readCachedPageDetail("cache-user-4", "cache-page-4"));
    await cache.blockCachedPage("cache-user-4", "cache-page-4");
    assert.equal(await cache.readCachedPageDetail("cache-user-4", "cache-page-4"), null);
    assert.ok((await cache.exportCachedPageState("cache-user-4", "cache-page-4"))?.byteLength);
    cache.releasePageDocument(entry);
    await cache.clearPageCacheForUser("cache-user-4");
  });

  test("read snapshots are scoped to their account and removed on sign out", async () => {
    const cache = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    await cache.rememberPageSnapshot(
      "cache-user-5",
      "database:db-1",
      ["db", "session-1", "db-1", "bootstrap", null, false],
      { database: { id: "db-1" } },
      Date.now(),
    );
    assert.equal((await cache.readPageSnapshots("cache-user-5", ["database:db-1"])).length, 1);
    assert.equal((await cache.readPageSnapshots("cache-user-6", ["database:db-1"])).length, 0);
    await cache.clearPageCacheForUser("cache-user-5");
    assert.equal((await cache.readPageSnapshots("cache-user-5", ["database:db-1"])).length, 0);
  });

  test("sign out drains pending snapshot writes before clearing them", async () => {
    const cache = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    const writes = Array.from({ length: 20 }, (_, index) =>
      cache.rememberPageSnapshot(
        "cache-user-7",
        "page:page-7",
        ["page", "page-7", `data-${index}`],
        { value: index },
        Date.now(),
      ),
    );
    await cache.clearPageCacheForUser("cache-user-7");
    await Promise.all(writes);
    assert.equal((await cache.readPageSnapshots("cache-user-7", ["page:page-7"])).length, 0);
  });
}
