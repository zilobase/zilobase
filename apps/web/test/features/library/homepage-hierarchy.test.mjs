export function register({ readSource, assert, loadModule, test }) {
  test("homepage hierarchy follows canonical page and database placements", async () => {
    const { buildHomepageHierarchy } = await loadModule(
      "/src/features/library/model/homepage-hierarchy.ts",
    )
    const hierarchy = buildHomepageHierarchy([
      createPlacement({
        id: "linked-page",
        itemId: "child",
        parentId: "linked-parent",
        placementKind: "linked",
        position: 5,
      }),
      createPlacement({
        id: "primary-page",
        itemId: "child",
        parentId: "parent",
        placementKind: "primary",
        position: 1,
      }),
      createPlacement({
        id: "nested-database",
        itemId: "projects",
        itemKind: "database",
        parentId: "parent",
        placementKind: "primary",
        position: 2,
      }),
      createPlacement({
        id: "database-row",
        itemId: "task",
        parentId: "projects",
        parentKind: "database",
        placementKind: "database_row",
        position: 3,
      }),
    ])

    assert.deepEqual(hierarchy.parentRowIdByRowId, {
      "page:child": "page:parent",
      "database:projects": "page:parent",
      "page:task": "database:projects",
    })
    assert.deepEqual(hierarchy.positionByRowId, {
      "page:child": 1,
      "database:projects": 2,
      "page:task": 3,
    })
  })

  test("synthetic homepage databases do not request realtime tickets", async () => {
    const [homepage, context] = await Promise.all([
      readSource("/src/features/library/pages/recents.tsx"),
      readSource("/src/features/databases/views/model/database-view-context.tsx"),
    ])

    assert.match(homepage, /realtimeEnabled: false/)
    assert.match(context, /value\.realtimeEnabled !== false/)
  })

  test("database realtime tickets use the host database id", async () => {
    const [context, controller] = await Promise.all([
      readSource("/src/features/databases/views/model/database-view-context.tsx"),
      readSource("/src/features/databases/views/controller/use-database-view-controller.tsx"),
    ])

    assert.match(
      context,
      /useDatabaseRealtime\(value\.hostDatabaseId, \{/,
    )
    assert.doesNotMatch(context, /useDatabaseRealtime\(value\.databaseId, \{/)
    assert.match(
      controller,
      /hostDatabaseId: payload\?\.database\.id \?\? databaseId/,
    )
  })
}

function createPlacement({
  id,
  itemId,
  itemKind = "page",
  parentId,
  parentKind = "page",
  placementKind,
  position,
}) {
  return {
    id,
    itemId,
    itemKind,
    parentId,
    parentKind,
    placementKind,
    position,
    workspaceId: "workspace",
  }
}
