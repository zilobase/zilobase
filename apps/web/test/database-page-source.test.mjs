import { readFile } from "node:fs/promises"

export function register({ assert, loadModule, test }) {
  test("full database metadata renders only the datasource heading", async () => {
    const source = await readFile(
      new URL("../src/pages/database.tsx", import.meta.url),
      "utf8"
    )

    assert.match(source, /<PageMetadataView[\s\S]*?layoutSection="heading"/)
  })

  test("full database pages resolve metadata from the active linked data source", async () => {
    const { resolveDatabasePageSource } = await loadModule(
      "/src/pages/database-page-source.ts"
    )
    const linkedView = {
      databaseId: "tasks-database",
      databaseName: "Tasks Tracker",
      sourceKind: "source",
      viewId: "tasks-chart",
      viewName: "Chart",
      viewType: "chart",
    }

    const source = resolveDatabasePageSource({
      activeViewId: "linked:tasks-database:tasks-chart",
      config: { linkedDatabaseViews: [linkedView] },
      hostDatabaseId: "projects-database",
    })

    assert.equal(source.databaseId, "tasks-database")
    assert.equal(source.linkedView?.databaseName, "Tasks Tracker")
    assert.equal(source.linkedView?.viewId, "tasks-chart")
  })

  test("full database pages keep host metadata for a local view", async () => {
    const { resolveDatabasePageSource } = await loadModule(
      "/src/pages/database-page-source.ts"
    )

    assert.deepEqual(
      resolveDatabasePageSource({
        activeViewId: "projects-table",
        config: {
          linkedDatabaseViews: [
            {
              databaseId: "tasks-database",
              databaseName: "Tasks Tracker",
              viewId: "tasks-chart",
              viewName: "Chart",
              viewType: "chart",
            },
          ],
        },
        hostDatabaseId: "projects-database",
      }),
      {
        databaseId: "projects-database",
        linkedView: null,
      }
    )
  })
}
