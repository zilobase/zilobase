import "fake-indexeddb/auto";

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
}
