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

  test("unsupported sidebar settings reset to the canonical layout", async () => {
    const { defaultSidebarConfig, normalizeSidebarConfig } = await loadModule(configPath)
    const input = {
      version: 2,
      libraryView: "shared",
      defaultLayout: { tabs: [], taskDatabaseIds: ["tasks-1"] },
      workspaceLayouts: {},
    }

    assert.deepEqual(normalizeSidebarConfig(input), defaultSidebarConfig)
  })

  test("sidebar normalization enforces locked Home, AI, Mail, and Calendar tabs with payload caps", async () => {
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
    assert.equal(config.defaultLayout.tabs[3].id, "calendar")
    assert.equal(config.defaultLayout.tabs[3].name, "Calendar")
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

    const [home, ai, mail, calendar, custom] = layout.tabs
    assert.deepEqual(home.shortcuts, [])
    assert.deepEqual(home.sections, [])
    assert.deepEqual(custom.shortcuts, [])
    assert.deepEqual(custom.sections, [])
    assert.equal(ai.name, "AI")
    assert.deepEqual(ai.shortcuts.map((shortcut) => shortcut.id), ["ai-new"])
    assert.equal(ai.shortcuts[0].label, "Start chat")
    assert.deepEqual(ai.sections.map((section) => section.kind), ["aiChats"])
    assert.equal(ai.sections[0].limit, 20)
    assert.deepEqual(calendar, { icon: "calendar", id: "calendar", name: "Calendar", sections: [], shortcuts: [] })
    assert.equal(mail.name, "Mail")
    assert.deepEqual(mail.shortcuts.map((shortcut) => shortcut.id), ["mail-inbox", "mail-compose"])
    assert.equal(mail.shortcuts[0].label, "Primary")
    assert.deepEqual(mail.sections, [])
  })

  test("Calendar is restored once in saved layouts and remains a fixed route tab", async () => {
    const { normalizeSidebarWorkspaceLayout, isFixedSidebarTabId, isStaticSidebarTabId } = await loadModule(configPath)
    const layout = normalizeSidebarWorkspaceLayout({
      tabs: [
        { id: "calendar", name: "Renamed", icon: "star", sections: [{ id: "pages", kind: "recents" }], shortcuts: [{ id: "tasks", target: { type: "route", route: "tasks" } }] },
        { id: "calendar", name: "Duplicate", sections: [], shortcuts: [] },
      ],
    })
    assert.deepEqual(layout.tabs.map((tab) => tab.id), ["home", "ai", "mail", "calendar"])
    assert.deepEqual(layout.tabs[3], { id: "calendar", name: "Calendar", icon: "calendar", sections: [], shortcuts: [] })
    assert.deepEqual(normalizeSidebarWorkspaceLayout(layout), layout)
    assert.equal(isFixedSidebarTabId("calendar"), true)
    assert.equal(isStaticSidebarTabId("calendar"), true)
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

    assert.equal(normalizeSidebarWorkspaceLayout(makeLayout(safeSvg)).tabs[4].icon, safeSvg)
    assert.equal(
      normalizeSidebarWorkspaceLayout(makeLayout('<svg onload="alert(1)"></svg>')).tabs[4].icon,
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
