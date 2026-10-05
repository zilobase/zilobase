const searchQueriesPath = "/apps/web/test/support/fixtures/sidebar-search.ts";

export function register({ assert, loadModule, test }) {
  test("sidebar picker searches one item type on the server", async () => {
    const { appSearchQueryOptions, TestQueryClient } = await loadModule(searchQueriesPath);
    let requestedPath = "";
    const options = appSearchQueryOptions(
      async (path) => {
        requestedPath = path;
        return { results: [] };
      },
      "workspace-1",
      "project plan",
      true,
      ["page"],
    );

    const client = new TestQueryClient();
    try {
      await client.fetchQuery(options);
    } finally {
      client.clear();
    }

    assert.equal(requestedPath, "/search?workspaceId=workspace-1&q=project+plan&types=page");
    assert.deepEqual(options.queryKey, ["search", "workspace-1", "project plan", "page"]);
  });
}
