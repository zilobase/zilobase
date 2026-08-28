import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const sidebarConfigPath = fileURLToPath(
  new URL(
    "../../../packages/features/src/user-settings/sidebar-config.ts",
    import.meta.url,
  ),
)

export function register({ assert, loadModule, test }) {
  test("meetings is a supported Library view", async () => {
    const { libraryViewIds, normalizeSidebarConfig } =
      await loadModule(sidebarConfigPath)

    assert.ok(libraryViewIds.includes("meetings"))
    assert.equal(
      normalizeSidebarConfig({
        defaultLayout: { tabs: [], taskDatabaseIds: [] },
        libraryView: "meetings",
        version: 2,
        workspaceLayouts: {},
      }).libraryView,
      "meetings",
    )
  })

  test("Library lists meetings and its sidebar shortcut opens that tab", async () => {
    const librarySource = await readFile(
      new URL("../src/pages/recents.tsx", import.meta.url),
      "utf8",
    )
    const sidebarSource = await readFile(
      new URL("../src/components/app-sidebar.tsx", import.meta.url),
      "utf8",
    )
    const customizeSource = await readFile(
      new URL("../src/components/sidebar-customize-panel.tsx", import.meta.url),
      "utf8",
    )
    const iconSource = await readFile(
      new URL("../src/components/sidebar-layout-icons.tsx", import.meta.url),
      "utf8",
    )
    const toolbarSource = await readFile(
      new URL(
        "../src/editor/extensions/database/views/database-view-toolbar.tsx",
        import.meta.url,
      ),
      "utf8",
    )

    assert.match(librarySource, /id: "meetings", label: "Meetings"/)
    assert.match(librarySource, /useWorkspaceMeetings\(/)
    assert.match(librarySource, /fallbackIcon: view\.icon/)
    assert.match(toolbarSource, /view\.fallbackIcon \?\? \(view\.type/)
    assert.match(customizeSource, /const Icon = libraryViewIcons\[view\]/)
    assert.match(customizeSource, /<Icon \/>\{libraryViewLabels\[view\]\}/)
    assert.doesNotMatch(
      customizeSource,
      /onAdd\(\{ route: "meetings", type: "route" \}\)/,
    )
    assert.match(iconSource, /favourites: StarIcon/)
    assert.match(iconSource, /meetings: CalendarDaysIcon/)
    assert.match(iconSource, /private: LockIcon/)
    assert.match(iconSource, /recents: HistoryIcon/)
    assert.match(iconSource, /shared: UsersIcon/)
    assert.match(iconSource, /teamspaces: Layers3Icon/)
    assert.match(
      librarySource,
      /case "meetings":[\s\S]*row\.itemKind === "meeting"/,
    )
    assert.match(
      librarySource,
      /params: \{ meetingId: row\.openMeetingId \}[\s\S]*to: "\/m\/\$meetingId"/,
    )
    assert.match(
      sidebarSource,
      /target\.route === "meetings"\) void navigate\(\{ search: \{ view: "meetings" \}, to: "\/recents" \}\)/,
    )
  })
}
