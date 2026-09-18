export function register({ assert, loadModule, readSource, test }) {
  test("database controller composes bootstrap metadata and live record windows", async () => {
    const controller = await readSource(
      "/src/features/databases/views/controller/use-database-view-controller.tsx",
    )
    assert.match(controller, /useDatabaseBootstrap/)
    assert.match(controller, /useDatabaseRecords/)
    assert.match(controller, /composeDatabaseViewData/)
    assert.doesNotMatch(controller, /\buseDatabase\(/)
  })

  test("controller view data keeps record identity and source scoping", async () => {
    const { composeDatabaseViewData } = await loadModule(
      "/src/features/databases/views/model/database-controller-state.ts",
    )
    const timestamp = "2026-09-14T00:00:00.000Z"
    const viewData = composeDatabaseViewData({
      bootstrap: {
        database: {
          accessLevel: "edit",
          config: {},
          createdAt: timestamp,
          id: "database-1",
          name: "Tasks",
          pageId: null,
          updatedAt: timestamp,
          version: 2,
          workspaceId: "workspace-1",
        },
        dataSources: [{
          config: {},
          configVersion: 1,
          createdAt: timestamp,
          id: "source-1",
          linkedAt: null,
          name: "Tasks",
          parentDatabaseId: "database-1",
          position: 0,
          updatedAt: timestamp,
          version: 2,
          workspaceId: "workspace-1",
        }],
        properties: [],
        views: [{
          config: {},
          createdAt: timestamp,
          databaseId: "database-1",
          dataSourceId: "source-1",
          id: "view-1",
          name: "Table",
          position: 0,
          type: "table",
          updatedAt: timestamp,
        }],
      },
      dataSourceId: "source-1",
      hasMore: true,
      records: [{
        createdAt: timestamp,
        dataSourceId: "source-1",
        id: "row-1",
        orderKey: "1024.0000000000",
        page: {
          createdAt: timestamp,
          deletedAt: null,
          hasContent: false,
          id: "page-1",
          metadata: {},
          name: "First",
          updatedAt: timestamp,
        },
        pageId: "page-1",
        parentRowId: null,
        updatedAt: timestamp,
        valuesByPropertyId: {
          "property-1": {
            createdAt: timestamp,
            id: "value-1",
            pageId: "page-1",
            propertyId: "property-1",
            updatedAt: timestamp,
            value: "Done",
          },
        },
      }],
      totalCount: 51,
    })

    assert.equal(viewData.activeDataSource.id, "source-1")
    assert.equal(viewData.dataSourceId, "source-1")
    assert.equal(viewData.records[0].id, "row-1")
    assert.equal(
      viewData.records[0].valuesByPropertyId["property-1"].value,
      "Done",
    )
    assert.equal(viewData.records[0].orderKey, "1024.0000000000")
    assert.equal(viewData.hasMore, true)
    assert.equal(viewData.totalCount, 51)
  })
}
