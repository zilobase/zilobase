export function register({ assert, loadModule, test }) {
  test("sidebar navigation orders placements and stops page cycles", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/components/sidebar-navigation-model.tsx"
    )
    const pages = [
      createPage("root", "Root", "2025-12-31T00:00:00.000Z"),
      createPage("parent", "Parent", "2026-01-01T00:00:00.000Z"),
      createPage("first", "First", "2026-01-02T00:00:00.000Z"),
      createPage("second", "Second", "2026-01-03T00:00:00.000Z"),
    ]
    const placements = [
      createPlacement("second-placement", "parent", "second", 2),
      createPlacement("first-placement", "parent", "first", 1),
      createPlacement("cycle-placement", "first", "parent", 0),
      createPlacement("root-placement", "root", "parent", 0),
    ]

    const { sections } = buildSidebarNavigation(pages, [], placements, icons)
    const root = sections.privatePages[0]
    const parent = root.pages[0]

    assert.equal(root.id, "root")
    assert.equal(parent.id, "parent")
    assert.deepEqual(
      parent.pages.map((page) => page.id),
      ["first", "second"]
    )
    assert.equal(parent.pages[0].pages[0].id, "parent")
    assert.equal(parent.pages[0].pages[0].isLinked, true)
    assert.deepEqual(parent.pages[0].pages[0].pages, [])
  })

  test("sidebar favorites keep parent hierarchy and explicit nested roots", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/components/sidebar-navigation-model.tsx"
    )
    const parent = {
      ...createPage("parent", "Parent", "2026-01-01T00:00:00.000Z"),
      isFavorite: true,
    }
    const child = {
      ...createPage("child", "Child", "2026-01-02T00:00:00.000Z"),
      isFavorite: true,
    }
    const deleted = {
      ...createPage("deleted", "Deleted", "2026-01-03T00:00:00.000Z"),
      deletedAt: "2026-02-01T00:00:00.000Z",
    }

    const result = buildSidebarNavigation(
      [parent, child, deleted],
      [],
      [createPlacement("child-placement", "parent", "child", 0)],
      icons
    )

    assert.deepEqual(
      result.sections.privatePages.map((page) => page.id),
      ["parent"]
    )
    assert.deepEqual(
      result.favorites.map((page) => page.id),
      ["parent", "child"]
    )
    assert.deepEqual(
      result.favorites[0].pages.map((page) => page.id),
      ["child"]
    )
    assert.equal(result.favorites[0].pages[0].isFavorite, true)
  })

  test("sidebar favorites keep a nested database as its own favorite", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/components/sidebar-navigation-model.tsx"
    )
    const parent = {
      ...createPage("parent", "Parent", "2026-01-01T00:00:00.000Z"),
      isFavorite: true,
    }
    const database = {
      createdAt: "2026-01-02T00:00:00.000Z",
      id: "tasks",
      isFavorite: true,
      name: "Tasks",
      pageId: parent.id,
      updatedAt: "2026-01-02T00:00:00.000Z",
      views: [],
      workspaceId: "workspace",
    }
    const placement = {
      ...createPlacement("database-placement", parent.id, database.id, 0),
      itemKind: "database",
    }

    const result = buildSidebarNavigation(
      [parent],
      [database],
      [placement],
      icons
    )

    assert.deepEqual(
      result.favorites.map((item) => item.id),
      ["parent", "database:tasks"]
    )
    assert.deepEqual(
      result.favorites[0].pages.map((item) => item.id),
      ["database:tasks"]
    )
  })

  test("sidebar favorites include pages represented only as database rows", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/components/sidebar-navigation-model.tsx"
    )
    const parent = createPage(
      "parent",
      "Parent",
      "2026-01-01T00:00:00.000Z"
    )
    const rowPage = {
      ...createPage("row-page", "Row page", "2026-01-02T00:00:00.000Z"),
      isFavorite: true,
    }
    const database = {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "database",
      name: "Tasks",
      pageId: parent.id,
      updatedAt: "2026-01-01T00:00:00.000Z",
      views: [],
      workspaceId: "workspace",
    }
    const placements = [
      {
        ...createPlacement("database-placement", parent.id, database.id, 0),
        itemKind: "database",
      },
      {
        ...createPlacement("row-placement", database.id, rowPage.id, 0),
        parentKind: "database",
        placementKind: "database_row",
      },
    ]

    const result = buildSidebarNavigation(
      [parent, rowPage],
      [database],
      placements,
      icons
    )

    assert.deepEqual(
      result.favorites.map((item) => item.id),
      ["row-page"]
    )
    assert.equal(result.favorites[0].name, "Row page")
  })
}

const icons = {
  getDatabaseIcon: () => "database",
  getDatabaseViewIcon: () => "view",
  getPageIcon: () => "page",
}

function createPage(id, name, createdAt) {
  return {
    createdAt,
    id,
    name,
    type: "page",
    updatedAt: createdAt,
    url: `/p/${id}`,
    workspaceId: "workspace",
  }
}

function createPlacement(id, parentId, itemId, position) {
  return {
    id,
    itemId,
    itemKind: "page",
    parentId,
    parentKind: "page",
    placementKind: "primary",
    position,
    workspaceId: "workspace",
  }
}
