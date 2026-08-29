export function register({ assert, loadModule, test }) {
  test("sidebar groups real teamspace pages separately from shared pages", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
    )
    const privatePage = createPage("private", "Private", "2026-08-01T00:00:00.000Z")
    const sharedPage = {
      ...createPage("shared", "Shared", "2026-08-02T00:00:00.000Z"),
      isShared: true,
    }
    const teamspacePage = {
      ...createPage("team-page", "Team page", "2026-08-03T00:00:00.000Z"),
      teamspaceId: "teamspace-1",
    }

    const { sections } = buildSidebarNavigation(
      [privatePage, sharedPage, teamspacePage],
      [],
      [],
      icons,
    )

    assert.deepEqual(sections.privatePages.map((item) => item.id), ["private"])
    assert.deepEqual(sections.teamspacePages.map((item) => item.id), ["shared"])
    assert.deepEqual(
      sections.teamspacePagesById["teamspace-1"].map((item) => item.id),
      ["team-page"],
    )
  })

  test("sidebar recents combine pages and databases by last visit", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
    )
    const page = {
      ...createPage("page", "Page", "2026-08-01T00:00:00.000Z"),
      lastVisitedAt: "2026-08-13T00:00:00.000Z",
    }
    const database = {
      createdAt: "2026-08-01T00:00:00.000Z",
      id: "database",
      lastVisitedAt: "2026-08-14T00:00:00.000Z",
      name: "Database",
      pageId: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
      views: [],
      workspaceId: "workspace",
    }
    const neverVisited = createPage(
      "never-visited",
      "Never visited",
      "2026-08-02T00:00:00.000Z"
    )

    const result = buildSidebarNavigation(
      [page, neverVisited],
      [database],
      [],
      icons
    )

    assert.deepEqual(
      result.recents.map((item) => item.id),
      ["database:database", "page"]
    )
  })

  test("sidebar navigation hides meeting notes pages", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
    )
    const host = createPage("host", "Host", "2026-08-01T00:00:00.000Z")
    const notes = {
      ...createPage("notes", "Standup notes", "2026-08-02T00:00:00.000Z"),
      type: "meeting",
    }
    const { sections } = buildSidebarNavigation(
      [host, notes],
      [],
      [createPlacement("notes-placement", "host", "notes", 0)],
      icons
    )

    assert.equal(sections.privatePages[0].id, "host")
    assert.deepEqual(sections.privatePages[0].pages, [])
  })

  test("sidebar navigation represents meeting blocks beneath their host page", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
    )
    const host = createPage("host", "Host", "2026-08-01T00:00:00.000Z")
    const notes = {
      ...createPage("notes", "Planning notes", "2026-08-02T00:00:00.000Z"),
      type: "meeting",
    }
    const meeting = createMeeting("meeting-1", host.id, notes.id, "Planning")
    const { sections } = buildSidebarNavigation(
      [host, notes],
      [],
      [createPlacement("notes-placement", host.id, notes.id, 0)],
      { ...icons, getMeetingIcon: () => "meeting" },
      [meeting],
    )

    const meetingNode = sections.privatePages[0].pages[0]
    assert.equal(meetingNode.id, "meeting:meeting-1")
    assert.equal(meetingNode.meetingId, "meeting-1")
    assert.equal(meetingNode.pageId, "host")
    assert.equal(meetingNode.name, "Planning")
    assert.equal(meetingNode.emoji, "meeting")
    assert.equal(meetingNode.isMeeting, true)
  })

  test("sidebar navigation keeps meetings visible when their notes placement is missing", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
    )
    const host = createPage("host", "Host", "2026-08-01T00:00:00.000Z")
    const meeting = createMeeting("meeting-1", host.id, null, "Planning")
    const { sections } = buildSidebarNavigation(
      [host],
      [],
      [],
      icons,
      [meeting],
    )

    assert.deepEqual(
      sections.privatePages[0].pages.map((item) => item.id),
      ["meeting:meeting-1"],
    )
  })

  test("sidebar navigation orders placements and stops page cycles", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
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
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
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
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
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
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
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

  test("sidebar nests a moved data source inside another database", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
    )
    const parentDatabase = createDatabase("projects", "Projects")
    const movedDatabase = createDatabase("tasks", "Tasks")
    const placement = {
      ...createPlacement(
        "nested-database-placement",
        parentDatabase.id,
        movedDatabase.id,
        0,
      ),
      itemKind: "database",
      parentKind: "database",
    }

    const { sections } = buildSidebarNavigation(
      [],
      [parentDatabase, movedDatabase],
      [placement],
      icons,
    )

    assert.deepEqual(
      sections.privatePages.map((item) => item.id),
      ["database:projects"],
    )
    assert.deepEqual(
      sections.privatePages[0].pages.map((item) => item.id),
      ["database:tasks"],
    )
  })

  test("detached database-row favorites keep linked database children", async () => {
    const { buildSidebarNavigation } = await loadModule(
      "/src/features/sidebar/model/sidebar-navigation-model.tsx"
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
      {
        ...createPlacement("linked-database", rowPage.id, database.id, 0),
        itemKind: "database",
        placementKind: "linked",
      },
    ]

    const result = buildSidebarNavigation(
      [parent, rowPage],
      [database],
      placements,
      icons
    )

    assert.deepEqual(
      result.favorites[0].pages.map((item) => item.id),
      ["database:database"]
    )
    assert.equal(result.favorites[0].pages[0].isLinked, true)
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

function createDatabase(id, name) {
  return {
    createdAt: "2026-08-01T00:00:00.000Z",
    id,
    name,
    pageId: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
    views: [],
    workspaceId: "workspace",
  }
}

function createMeeting(id, pageId, notesPageId, title) {
  return {
    createdAt: "2026-08-02T00:00:00.000Z",
    deletedAt: null,
    emoji: "📅",
    id,
    notesPageId,
    pageId,
    title,
    updatedAt: "2026-08-02T00:00:00.000Z",
    workspaceId: "workspace",
  }
}
