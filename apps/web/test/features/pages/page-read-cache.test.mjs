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
}
