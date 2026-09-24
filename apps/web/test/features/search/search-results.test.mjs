export function register({ assert, loadModule, test }) {
  test("search keeps agent matches before server results and preserves result destinations", async () => {
    const { combineSearchResults, getSearchResultDestination } = await loadModule(
      "/src/features/search/search-results.ts",
    );
    const agents = [
      { id: "one", name: "Planning" },
      { id: "two", name: "Writer" },
    ];
    const results = [{ id: "page", title: "Plan", type: "page", emoji: null, path: "Workspace" }];
    assert.deepEqual(combineSearchResults(agents, results, "PLAN"), [
      { id: "one", title: "Planning", type: "agent", emoji: null, path: "Agents" },
      ...results,
    ]);
    assert.equal(combineSearchResults(agents, results, "").length, 3);
    assert.deepEqual(combineSearchResults(agents, results, "missing"), results);
    assert.deepEqual(getSearchResultDestination({ type: "database", id: "db" }), {
      to: "/d/$databaseId",
      params: { databaseId: "db" },
      search: { view: undefined },
    });
    assert.deepEqual(getSearchResultDestination({ type: "agent", id: "agent" }), {
      to: "/agents/$agentId",
      params: { agentId: "agent" },
    });
    assert.deepEqual(getSearchResultDestination({ type: "page", id: "page" }), {
      to: "/p/$pageId",
      params: { pageId: "page" },
    });
  });
}
