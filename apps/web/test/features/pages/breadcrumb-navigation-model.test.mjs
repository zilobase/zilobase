export function register({ readSource, assert, loadModule, test }) {
  test("page topbars have no border or fading shadow", async () => {
    const [headerSource, viewportSource] = await Promise.all([
      readSource("/src/features/pages/components/page-pane-header.tsx"),
      readSource("/src/features/pages/context/page-side-pane.tsx"),
    ])

    assert.doesNotMatch(headerSource, /bordered|border-b/)
    assert.doesNotMatch(viewportSource, /top-0[^\n]*bg-gradient-to-b|bg-gradient-to-b[^\n]*top-0/)
  })

  test("Library breadcrumbs reflect the active view label and icon", async () => {
    const source = await readSource("/src/features/pages/components/page-pane-header.tsx")

    assert.match(source, /libraryViewIds\.includes\(requestedView/)
    assert.match(source, /libraryViewIcons\[libraryView\]/)
    assert.match(source, /libraryViewLabels\[libraryView\]/)
  })

  test("breadcrumbs follow page, database, and database-row ancestry", async () => {
    const { buildCanonicalBreadcrumbTrail } = await loadModule(
      "/src/features/pages/model/breadcrumb-navigation-model.ts",
    )
    const pages = [
      page("meeting", "Meeting", { isShared: false }),
      page("release", "Publish release notes"),
    ]
    const databases = [database("tasks", "Tasks Tracker", "meeting")]
    const placements = [
      placement("database", "tasks", "page", "meeting", "primary"),
      placement("page", "release", "database", "tasks", "database_row"),
    ]

    assert.deepEqual(
      buildCanonicalBreadcrumbTrail(
        { id: "release", kind: "page" },
        pages,
        databases,
        placements,
      ).map((item) => `${item.kind}:${item.id}`),
      ["page:meeting", "database:tasks", "page:release"],
    )
  })

  test("linked databases resolve breadcrumbs from their original placement", async () => {
    const { buildCanonicalBreadcrumbTrail } = await loadModule(
      "/src/features/pages/model/breadcrumb-navigation-model.ts",
    )
    const pages = [page("original", "Original"), page("link-host", "Link host")]
    const databases = [database("tasks", "Tasks", "original")]
    const placements = [
      placement("database", "tasks", "page", "link-host", "linked"),
      placement("database", "tasks", "page", "original", "primary"),
    ]

    assert.deepEqual(
      buildCanonicalBreadcrumbTrail(
        { id: "tasks", kind: "database" },
        pages,
        databases,
        placements,
      ).map((item) => `${item.kind}:${item.id}`),
      ["page:original", "database:tasks"],
    )
  })

  test("breadcrumb roots distinguish private, shared, and named teamspaces", async () => {
    const { getBreadcrumbNavigationSection } = await loadModule(
      "/src/features/pages/model/breadcrumb-navigation-model.ts",
    )
    const trail = (value) => [{ id: value.id, kind: "page", page: value }]

    assert.equal(getBreadcrumbNavigationSection(trail(page("private", "Private")), new Map()).kind, "private")
    assert.equal(getBreadcrumbNavigationSection(trail(page("shared", "Shared", { isShared: true })), new Map()).kind, "shared")
    assert.deepEqual(
      getBreadcrumbNavigationSection(trail(page("team", "Team", { teamspaceId: "product" })), new Map([["product", "Product"]])),
      { kind: "teamspace", label: "Product", teamspaceId: "product" },
    )
  })
}

function page(id, name, extra = {}) {
  return { createdAt: "", id, name, type: "page", updatedAt: "", url: `/p/${id}`, workspaceId: "workspace", ...extra }
}

function database(id, name, pageId = null) {
  return { createdAt: "", id, name, pageId, updatedAt: "", views: [], workspaceId: "workspace" }
}

function placement(itemKind, itemId, parentKind, parentId, placementKind) {
  return { id: `${parentId}:${itemId}:${placementKind}`, itemId, itemKind, parentId, parentKind, placementKind, position: 0, workspaceId: "workspace" }
}
