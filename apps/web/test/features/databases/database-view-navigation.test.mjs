export function register({ assert, loadModule, test }) {
  test("sidebar omits the default database view from the URL", async () => {
    const { getSidebarDatabaseViewSearchId } = await loadModule(
      "/src/components/database-view-navigation.ts"
    )

    assert.equal(
      getSidebarDatabaseViewSearchId({
        databaseId: "database-1",
        databaseViewId: "view-1",
        defaultDatabaseViewId: "view-1",
        isDatabaseView: true,
      }),
      undefined
    )
  })

  test("sidebar includes a non-default database view in the URL", async () => {
    const { getSidebarDatabaseViewSearchId } = await loadModule(
      "/src/components/database-view-navigation.ts"
    )

    assert.equal(
      getSidebarDatabaseViewSearchId({
        databaseId: "database-1",
        databaseViewId: "view-2",
        defaultDatabaseViewId: "view-1",
        isDatabaseView: true,
      }),
      "view-2"
    )
  })
}
