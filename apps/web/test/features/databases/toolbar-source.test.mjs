export function register({ assert, loadModule, test }) {
  test("toolbar source identity preserves host selection and empty identifiers", async () => {
    const {
      getToolbarActiveView,
      getToolbarSourceIdentity,
      getToolbarSourceTitle,
      getToolbarFallbackSources,
    } = await loadModule("/src/features/databases/views/model/toolbar-source.ts");
    const host = {
      databaseId: "source",
      hostDatabaseId: "host",
      workspaceId: "current",
      databaseWorkspaceId: "source-workspace",
      hostDatabaseWorkspaceId: "host-workspace",
      hostDatabaseName: "Host",
    };
    assert.deepEqual(getToolbarSourceIdentity(host), {
      databaseId: "host",
      workspaceId: "host-workspace",
      expandDatabaseId: "host",
    });
    assert.deepEqual(getToolbarSourceIdentity({ databaseId: "", workspaceId: "" }), {
      databaseId: "",
      workspaceId: "",
      expandDatabaseId: "",
    });
    assert.deepEqual(getToolbarActiveView(undefined, null, "Host"), {
      activeDataSourceId: undefined,
      activeDataSourceName: "Host",
      activeViewType: undefined,
    });
    assert.deepEqual(
      getToolbarActiveView(
        { dataSourceId: "source", dataSourceName: "", type: "table" },
        { type: "kanban" },
        "Host",
      ),
      { activeDataSourceId: "source", activeDataSourceName: "", activeViewType: "kanban" },
    );
    const linked = { dataSourceId: "source", sourceParentDatabaseId: "other" };
    assert.equal(getToolbarSourceTitle(host, linked, "Draft source"), "Host");
    assert.equal(
      getToolbarSourceTitle(host, { ...linked, sourceParentDatabaseId: "host" }, "Draft host"),
      "Draft host",
    );
    assert.equal(getToolbarSourceTitle({}, undefined, ""), "Untitled");
    assert.deepEqual(getToolbarFallbackSources("host", linked, "Host", 3), [
      { hiddenViewCount: 0, id: "source", name: "Host", parentDatabaseId: "other", viewCount: 3 },
    ]);
    assert.deepEqual(getToolbarFallbackSources("host", undefined, "Host", 0), []);
  });
}
