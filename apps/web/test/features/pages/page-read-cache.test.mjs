import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";

export function register({ assert, loadModule, test }) {
  test("visited page queries hydrate before fetch and remain account scoped", async () => {
    const storage = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    const cache = await loadModule("/src/features/pages/cache/page-read-cache.ts");
    const navigation = { databases: [], pages: [], placements: [] };
    await storage.rememberPageSnapshot(
      "reader-1",
      "workspace:workspace-1",
      ["pages", "workspace-1", "nav", "active"],
      navigation,
      Date.now() - 60_000,
    );
    await storage.rememberPageSnapshot(
      "reader-1",
      "page:page-1",
      ["page", "page-1", "properties"],
      { properties: [], values: [] },
      Date.now() - 60_000,
    );
    const client = new QueryClient();
    await cache.hydratePageReadCache({
      queryClient: client,
      userId: "reader-1",
      sessionId: "session-1",
      pageId: "page-1",
      workspaceId: "workspace-1",
      databaseIds: [],
    });
    assert.deepEqual(client.getQueryData(["pages", "workspace-1", "nav", "active"]), navigation);
    assert.deepEqual(client.getQueryData(["page", "page-1", "properties"]), {
      properties: [],
      values: [],
    });
    const other = new QueryClient();
    await cache.hydratePageReadCache({
      queryClient: other,
      userId: "reader-2",
      sessionId: "session-2",
      pageId: "page-1",
      workspaceId: "workspace-1",
      databaseIds: [],
    });
    assert.equal(other.getQueryData(["pages", "workspace-1", "nav", "active"]), undefined);
    await storage.clearPageCacheForUser("reader-1");
  });

  test("invalid saved database windows never hydrate under a query hash", async () => {
    const storage = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    const cache = await loadModule("/src/features/pages/cache/page-read-cache.ts");
    await storage.rememberPageSnapshot(
      "reader-3",
      "database:db-1",
      ["db", "$session", "db-1", "window", "source-1", "hash-a", false],
      { pages: [{ queryHash: "hash-b" }], pageParams: [null] },
      Date.now(),
    );
    const client = new QueryClient();
    await cache.hydratePageReadCache({
      queryClient: client,
      userId: "reader-3",
      sessionId: "new-session",
      pageId: "page-1",
      workspaceId: null,
      databaseIds: ["db-1"],
    });
    assert.equal(
      client.getQueryData(["db", "new-session", "db-1", "window", "source-1", "hash-a", false]),
      undefined,
    );
    await storage.clearPageCacheForUser("reader-3");
  });

  test("an access denial removes a cached database view", async () => {
    const storage = await loadModule("/src/features/editor/collaboration/page-document-cache.ts");
    const cache = await loadModule("/src/features/pages/cache/page-read-cache.ts");
    const queryKey = ["db", "session-4", "db-4", "bootstrap", null, false];
    await storage.rememberPageSnapshot(
      "reader-4",
      "database:db-4",
      ["db", "$session", "db-4", "bootstrap", null, false],
      { database: { id: "db-4" } },
      Date.now(),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const unsubscribe = cache.subscribePageReadCache(client, "reader-4", "session-4");
    await assert.rejects(
      client.fetchQuery({ queryKey, queryFn: () => Promise.reject({ status: 403 }) }),
    );
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!(await storage.readPageSnapshots("reader-4", ["database:db-4"])).length) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal((await storage.readPageSnapshots("reader-4", ["database:db-4"])).length, 0);
    assert.equal(client.getQueryData(queryKey), undefined);
    unsubscribe();
    await storage.clearPageCacheForUser("reader-4");
  });
}
