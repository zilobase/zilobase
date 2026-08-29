export function register({ assert, loadModule, test }) {
  test("side pane omits a database already identified by the route", async () => {
    const { getSidePaneDatabaseParam } = await loadModule(
      "/src/features/pages/context/page-side-pane.tsx"
    )

    assert.equal(
      getSidePaneDatabaseParam("/d/database-1", "database-1"),
      null
    )
  })

  test("side pane retains a different database context", async () => {
    const { getSidePaneDatabaseParam } = await loadModule(
      "/src/features/pages/context/page-side-pane.tsx"
    )

    assert.equal(
      getSidePaneDatabaseParam("/d/database-1", "database-2"),
      "database-2"
    )
    assert.equal(
      getSidePaneDatabaseParam("/p/page-1", "database-1"),
      "database-1"
    )
  })

  test("mobile side pane targets resolve to full-page routes", async () => {
    const { getFullDatabasePath, getFullPagePath } = await loadModule(
      "/src/features/pages/context/page-side-pane.tsx"
    )

    assert.equal(getFullPagePath("page id"), "/p/page%20id")
    assert.equal(getFullDatabasePath("database id"), "/d/database%20id")
  })
}
