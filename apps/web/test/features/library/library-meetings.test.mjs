import { readFile } from "node:fs/promises"
const sidebarConfigPath = "/packages/features/src/user-settings/sidebar-config.ts"

export function register({ readSource, assert, loadModule, test }) {
  test("Library Teamspaces uses a dedicated teamspace directory", async () => {
    const source = await readSource("/src/features/library/pages/recents.tsx")
    assert.match(source, /activeViewId === "teamspaces"[\s\S]*<TeamspacesLibraryTable[\s\S]*rows=\{rows\}[\s\S]*teamspaces=\{teamspaces\}/)
    assert.match(source, /Name[\s\S]*Description[\s\S]*Type[\s\S]*Access[\s\S]*Members/)
    assert.match(source, /<Plus \/> New teamspace/)
    assert.match(source, /<CreateLibraryTeamspaceDialog/)
    assert.match(source, /aria-expanded=\{expanded\}/)
    assert.match(source, /buildTeamspaceLibraryRows\(rows, teamspace\.id\)/)
    assert.match(source, /aria-label=\{`\$\{teamspace\.name\} contents`\}/)
    assert.match(source, /className="database-table"/)
    assert.match(source, /className="database-table-wrap min-w-\[58rem\] text-sm leading-5"/)
    assert.doesNotMatch(source, /className="database-table-wrap tiptap-editor/)
    assert.match(source, /<DatabasePageLink[\s\S]*onOpen=\{onOpenRow\}/)
  })

  test("Library keeps a full-page Library heading across tabs", async () => {
    const source = await readSource("/src/features/library/pages/recents.tsx")
    assert.match(source, /mode === "trash" \? "Trash" : "Library"/)
    assert.match(source, /<h1 className="min-h-10 py-0 text-4xl font-semibold/)
    assert.match(source, /showTitle: false/)
  })

  test("meetings is a supported Library view", async () => {
    const { libraryViewIds, normalizeSidebarConfig } =
      await loadModule(sidebarConfigPath)

    assert.ok(libraryViewIds.includes("meetings"))
    assert.equal(
      normalizeSidebarConfig({
        defaultLayout: { tabs: [], taskDatabaseIds: [] },
        libraryView: "meetings",
        version: 3,
        workspaceLayouts: {},
      }).libraryView,
      "meetings",
    )
  })

  test("Library lists meetings and its sidebar shortcut opens that tab", async () => {
    const librarySource = await readSource("/src/features/library/pages/recents.tsx")
    const sidebarSource = await readSource(
      "/src/features/sidebar/components/sidebar-shortcut-list.tsx",
    )
    const customizeSource = await readSource("/src/features/sidebar/components/sidebar-customize-panel.tsx")
    const iconSource = await readSource("/src/features/sidebar/components/sidebar-layout-icons.tsx")
    const toolbarSource = await readSource("/src/features/editor/extensions/database/views/database-view-toolbar.tsx")

    assert.match(librarySource, /id: "meetings", label: libraryViewLabels\.meetings/)
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
      /target\.route === "meetings"[\s\S]*search: \{ view: "meetings" \}[\s\S]*to: "\/recents"/,
    )
  })
}
