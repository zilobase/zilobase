const configPath = "/packages/features/src/user-settings/sidebar-config.ts"

export function register({ assert, loadModule, test }) {
  test("empty sidebar settings resolve to an isolated canonical default", async () => {
    const { defaultSidebarConfig, normalizeSidebarConfig } = await loadModule(configPath)
    const normalized = normalizeSidebarConfig({})

    assert.deepEqual(normalized, defaultSidebarConfig)
    assert.notEqual(normalized, defaultSidebarConfig)
    assert.notEqual(normalized.defaultLayout, defaultSidebarConfig.defaultLayout)
    assert.equal(
      normalized.defaultLayout.tabs[0].sections.at(-1).id,
      "default-teamspaces",
    )
  })

  test("legacy sidebar settings migrate deterministically into Home", async () => {
    const { normalizeSidebarConfig } = await loadModule(configPath)
    const input = {
      hiddenItems: ["recents", "calendar", "unknown"],
      libraryView: "shared",
      sectionLimits: { favorites: 15 },
      sectionOrder: ["shared", "favorites"],
      sectionSorts: { favorites: "alphabetical" },
      taskDatabaseIds: ["tasks-1", "tasks-1"],
    }
    const first = normalizeSidebarConfig(input)
    const second = normalizeSidebarConfig(input)

    assert.deepEqual(first, second)
    assert.equal(first.version, 3)
    assert.equal(first.libraryView, "shared")
    assert.deepEqual(first.defaultLayout.taskDatabaseIds, ["tasks-1"])
    assert.deepEqual(
      first.defaultLayout.tabs[0].sections.map((section) => section.kind),
      ["shared", "teamspaces", "favorites", "private"],
    )
    assert.equal(first.defaultLayout.tabs[0].sections[2].limit, 15)
    assert.equal(first.defaultLayout.tabs[0].sections[2].sort, "alphabetical")
  })

  test("sidebar normalization enforces locked Home, AI, and Mail tabs with payload caps", async () => {
    const { normalizeSidebarConfig } = await loadModule(configPath)
    const tabs = Array.from({ length: 12 }, (_, index) => ({
      icon: index === 0 ? "<script>" : "star",
      id: index === 0 ? "home" : `tab-${index}`,
      name: index === 0 ? "Renamed home" : `Tab ${index}`,
      sections: Array.from({ length: 30 }, (__, itemIndex) => ({
        id: `section-${index}-${itemIndex}`,
        kind: "recents",
        limit: 100,
        sort: "lastEdited",
      })),
      shortcuts: [],
    }))
    const config = normalizeSidebarConfig({
      defaultLayout: { tabs, taskDatabaseIds: [] },
      libraryView: "recents",
      version: 3,
      workspaceLayouts: {},
    })

    assert.equal(config.defaultLayout.tabs.length, 8)
    assert.equal(config.defaultLayout.tabs[0].id, "home")
    assert.equal(config.defaultLayout.tabs[0].name, "Home")
    assert.equal(config.defaultLayout.tabs[0].icon, "home")
    assert.equal(config.defaultLayout.tabs[0].sections.length, 24)
    assert.equal(config.defaultLayout.tabs[1].id, "ai")
    assert.equal(config.defaultLayout.tabs[1].name, "AI")
    assert.equal(config.defaultLayout.tabs[1].icon, "sparkles")
    assert.equal(config.defaultLayout.tabs[2].id, "mail")
    assert.equal(config.defaultLayout.tabs[2].name, "Mail")
    assert.equal(config.defaultLayout.tabs[2].icon, "mail")
  })

  test("shared pages and teamspaces are independent sidebar sections", async () => {
    const { defaultSidebarConfig, normalizeSidebarConfig, normalizeSidebarWorkspaceLayout } = await loadModule(configPath)
    assert.deepEqual(
      defaultSidebarConfig.defaultLayout.tabs[0].sections.slice(-2).map((section) => section.kind),
      ["shared", "teamspaces"],
    )
    const layout = normalizeSidebarWorkspaceLayout({
      tabs: [{
        icon: "home",
        id: "home",
        name: "Home",
        sections: [
          { id: "shared", kind: "shared", limit: 10, sort: "lastEdited" },
          { id: "teamspaces", kind: "teamspaces", limit: 10, sort: "lastEdited" },
        ],
        shortcuts: [],
      }],
      taskDatabaseIds: [],
    })
    assert.deepEqual(layout.tabs[0].sections.map((section) => section.kind), ["shared", "teamspaces"])

    const migrated = normalizeSidebarConfig({
      defaultLayout: {
        tabs: [{
          icon: "home",
          id: "home",
          name: "Home",
          sections: [{ id: "old-shared", kind: "shared", limit: 15, sort: "alphabetical" }],
          shortcuts: [],
        }],
        taskDatabaseIds: [],
      },
      libraryView: "shared",
      version: 2,
      workspaceLayouts: {},
    })
    assert.equal(migrated.version, 3)
    assert.deepEqual(migrated.defaultLayout.tabs[0].sections.map((section) => section.kind), ["shared", "teamspaces"])
    assert.equal(migrated.defaultLayout.tabs[0].sections[1].limit, 15)
    assert.equal(migrated.defaultLayout.tabs[0].sections[1].sort, "alphabetical")
  })

  test("workspace layouts resolve independently and preserve the default fallback", async () => {
    const {
      defaultSidebarConfig,
      resolveSidebarWorkspaceLayout,
      withSidebarWorkspaceLayout,
    } = await loadModule(configPath)
    const custom = {
      tabs: [{ icon: "star", id: "home", name: "Wrong", sections: [], shortcuts: [] }],
      taskDatabaseIds: ["database-1"],
    }
    const config = withSidebarWorkspaceLayout(defaultSidebarConfig, "workspace-1", custom)

    assert.deepEqual(resolveSidebarWorkspaceLayout(config, "workspace-1").taskDatabaseIds, ["database-1"])
    assert.deepEqual(resolveSidebarWorkspaceLayout(config, "workspace-2"), config.defaultLayout)
    assert.equal(resolveSidebarWorkspaceLayout(config, "workspace-1").tabs[0].name, "Home")
  })

  test("AI and Mail keep scoped customization while workspace tabs reject service navigation", async () => {
    const { normalizeSidebarWorkspaceLayout } = await loadModule(configPath)
    const serviceShortcuts = [
      { id: "ask-ai", target: { route: "ai", type: "route" } },
      { id: "new-chat", target: { action: "createChat", type: "action" } },
      { id: "compose", target: { action: "composeMail", type: "action" } },
      { id: "inbox", target: { type: "mail", view: "inbox" } },
    ]
    const layout = normalizeSidebarWorkspaceLayout({
      tabs: [
        {
          icon: "star",
          id: "home",
          name: "Renamed Home",
          sections: [{ id: "home-ai", kind: "aiChats", limit: 10, sort: "lastEdited" }],
          shortcuts: serviceShortcuts,
        },
        {
          icon: "circle",
          id: "ai",
          name: "Renamed AI",
          sections: [
            { id: "ai-history", kind: "aiChats", limit: 20, sort: "alphabetical" },
            { id: "ai-recents", kind: "recents", limit: 10, sort: "lastEdited" },
          ],
          shortcuts: [
            { id: "ai-new", label: "Start chat", target: { action: "createChat", type: "action" } },
            { id: "ai-tasks", target: { route: "tasks", type: "route" } },
          ],
        },
        {
          icon: "circle",
          id: "mail",
          name: "Renamed Mail",
          sections: [{ id: "mail-pages", kind: "recents", limit: 10, sort: "lastEdited" }],
          shortcuts: [
            { id: "mail-inbox", label: "Primary", target: { type: "mail", view: "inbox" } },
            { id: "mail-compose", target: { action: "composeMail", type: "action" } },
            { id: "mail-tasks", target: { route: "tasks", type: "route" } },
          ],
        },
        {
          icon: "star",
          id: "custom",
          name: "Custom",
          sections: [{ id: "custom-ai", kind: "aiChats", limit: 10, sort: "lastEdited" }],
          shortcuts: serviceShortcuts,
        },
      ],
      taskDatabaseIds: [],
    })

    const [home, ai, mail, custom] = layout.tabs
    assert.deepEqual(home.shortcuts, [])
    assert.deepEqual(home.sections, [])
    assert.deepEqual(custom.shortcuts, [])
    assert.deepEqual(custom.sections, [])
    assert.equal(ai.name, "AI")
    assert.deepEqual(ai.shortcuts.map((shortcut) => shortcut.id), ["ai-new"])
    assert.equal(ai.shortcuts[0].label, "Start chat")
    assert.deepEqual(ai.sections.map((section) => section.kind), ["aiChats"])
    assert.equal(ai.sections[0].limit, 20)
    assert.equal(mail.name, "Mail")
    assert.deepEqual(mail.shortcuts.map((shortcut) => shortcut.id), ["mail-inbox", "mail-compose"])
    assert.equal(mail.shortcuts[0].label, "Primary")
    assert.deepEqual(mail.sections, [])
  })

  test("Mail restores Compose when customization attempts to remove it", async () => {
    const { normalizeSidebarWorkspaceLayout } = await loadModule(configPath)
    const layout = normalizeSidebarWorkspaceLayout({
      tabs: [
        { icon: "home", id: "home", name: "Home", sections: [], shortcuts: [] },
        { icon: "mail", id: "mail", name: "Mail", sections: [], shortcuts: [
          { id: "only-inbox", target: { type: "mail", view: "inbox" } },
        ] },
      ],
      taskDatabaseIds: [],
    })
    const mail = layout.tabs.find((tab) => tab.id === "mail")

    assert.deepEqual(mail.shortcuts.map((shortcut) => shortcut.target), [
      { action: "composeMail", type: "action" },
      { type: "mail", view: "inbox" },
    ])
  })

  test("custom tab icons retain safe SVG icons and reject executable markup", async () => {
    const { normalizeSidebarWorkspaceLayout } = await loadModule(configPath)
    const makeLayout = (icon) => ({
      tabs: [
        { icon: "home", id: "home", name: "Home", sections: [], shortcuts: [] },
        { icon: "sparkles", id: "ai", name: "AI", sections: [], shortcuts: [] },
        { icon: "mail", id: "mail", name: "Mail", sections: [], shortcuts: [] },
        { icon, id: "custom", name: "Custom", sections: [], shortcuts: [] },
      ],
      taskDatabaseIds: [],
    })
    const safeSvg = '<svg viewBox="0 0 24 24"><path d="M1 1h2v2z" /></svg>'

    assert.equal(normalizeSidebarWorkspaceLayout(makeLayout(safeSvg)).tabs[3].icon, safeSvg)
    assert.equal(
      normalizeSidebarWorkspaceLayout(makeLayout('<svg onload="alert(1)"></svg>')).tabs[3].icon,
      "circle",
    )
  })

  test("shortcut icon overrides retain safe icons and reject executable markup", async () => {
    const { normalizeSidebarWorkspaceLayout } = await loadModule(configPath)
    const safeSvg = '<svg viewBox="0 0 24 24"><path d="M1 1h2v2z" /></svg>'
    const makeLayout = (icon) => ({
      tabs: [{
        icon: "home",
        id: "home",
        name: "Home",
        sections: [],
        shortcuts: [{ icon, id: "shortcut", target: { route: "tasks", type: "route" } }],
      }],
      taskDatabaseIds: [],
    })

    assert.equal(normalizeSidebarWorkspaceLayout(makeLayout(safeSvg)).tabs[0].shortcuts[0].icon, safeSvg)
    assert.equal(
      normalizeSidebarWorkspaceLayout(makeLayout('<svg onload="alert(1)"></svg>')).tabs[0].shortcuts[0].icon,
      undefined,
    )
  })
}
