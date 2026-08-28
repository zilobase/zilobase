import { fileURLToPath } from "node:url"

const configPath = fileURLToPath(
  new URL("../../../packages/features/src/user-settings/sidebar-config.ts", import.meta.url),
)

export function register({ assert, loadModule, test }) {
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
    assert.equal(first.version, 2)
    assert.equal(first.libraryView, "shared")
    assert.deepEqual(first.defaultLayout.taskDatabaseIds, ["tasks-1"])
    assert.deepEqual(
      first.defaultLayout.tabs[0].sections.map((section) => section.kind),
      ["shared", "favorites", "private"],
    )
    assert.equal(first.defaultLayout.tabs[0].sections[1].limit, 15)
    assert.equal(first.defaultLayout.tabs[0].sections[1].sort, "alphabetical")
  })

  test("v2 sidebar normalization enforces a locked Home tab and payload caps", async () => {
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
      version: 2,
      workspaceLayouts: {},
    })

    assert.equal(config.defaultLayout.tabs.length, 8)
    assert.equal(config.defaultLayout.tabs[0].id, "home")
    assert.equal(config.defaultLayout.tabs[0].name, "Home")
    assert.equal(config.defaultLayout.tabs[0].icon, "home")
    assert.equal(config.defaultLayout.tabs[0].sections.length, 24)
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

  test("custom tab icons retain safe SVG icons and reject executable markup", async () => {
    const { normalizeSidebarWorkspaceLayout } = await loadModule(configPath)
    const makeLayout = (icon) => ({
      tabs: [
        { icon: "home", id: "home", name: "Home", sections: [], shortcuts: [] },
        { icon, id: "custom", name: "Custom", sections: [], shortcuts: [] },
      ],
      taskDatabaseIds: [],
    })
    const safeSvg = '<svg viewBox="0 0 24 24"><path d="M1 1h2v2z" /></svg>'

    assert.equal(normalizeSidebarWorkspaceLayout(makeLayout(safeSvg)).tabs[1].icon, safeSvg)
    assert.equal(
      normalizeSidebarWorkspaceLayout(makeLayout('<svg onload="alert(1)"></svg>')).tabs[1].icon,
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
        shortcuts: [{ icon, id: "shortcut", target: { route: "ai", type: "route" } }],
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
