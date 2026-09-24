import { readFile } from "node:fs/promises";
const sidebarConfigPath = "/packages/features/src/user-settings/sidebar-config.ts";

export function register({ readSource, assert, loadModule, test }) {
  const readLibrarySource = async () =>
    (
      await Promise.all([
        readSource("/src/features/library/screens/recents.tsx"),
        readSource("/src/features/teamspaces/components/create-teamspace-dialog.tsx"),
      ])
    ).join("\n");
  const readToolbarSource = async () =>
    (
      await Promise.all([
        readSource("/src/features/databases/views/components/database-view-toolbar.tsx"),
        readSource("/src/features/databases/views/components/database-view-toolbar-dialogs.tsx"),
      ])
    ).join("\n");
  test("Library Teamspaces uses the shared hierarchy table", async () => {
    const source = await readLibrarySource();
    assert.match(source, /<DatabaseTableView \/>/);
    assert.doesNotMatch(source, /<TeamspacesLibraryTable/);
    assert.match(source, /<Plus \/> New teamspace/);
    assert.match(source, /<CreateLibraryTeamspaceDialog/);
  });

  test("Library keeps a full-page Library heading across tabs", async () => {
    const source = await readLibrarySource();
    assert.match(source, /const pageTitle = "Library"/);
    assert.match(source, /<h1 className="min-h-10 py-0 text-4xl font-semibold/);
    assert.match(source, /showTitle: false/);
  });

  test("Trash is a Library tab backed by the deleted navigation query", async () => {
    const { libraryViewIds, normalizeSidebarConfig } = await loadModule(sidebarConfigPath);
    const librarySource = await readLibrarySource();
    const routes = await readSource("/src/app/routing/route-groups/app-routes.tsx");
    const icons = await readSource("/src/features/sidebar/components/sidebar-layout-icons.tsx");

    assert.ok(libraryViewIds.includes("trash"));
    assert.match(librarySource, /activeViewId === "trash" \? "trash" : "home"/);
    assert.match(librarySource, /deleted: mode === "trash" \? "only" : "active"/);
    assert.match(
      routes,
      /path: "\/trash"[\s\S]*redirect\(\{ search: \{ view: "trash" \}, to: "\/recents" \}\)/,
    );
    assert.match(icons, /trash: Trash2Icon/);
    assert.equal(
      normalizeSidebarConfig({
        defaultLayout: { tabs: [], taskDatabaseIds: [] },
        libraryView: "trash",
        version: 3,
        workspaceLayouts: {},
      }).libraryView,
      "trash",
    );
  });

  test("meetings, skills and instructions are supported and remembered Library views", async () => {
    const { libraryViewIds, normalizeSidebarConfig } = await loadModule(sidebarConfigPath);

    for (const view of ["meetings", "skills", "instructions"]) {
      assert.ok(libraryViewIds.includes(view));
      assert.equal(
        normalizeSidebarConfig({
          defaultLayout: { tabs: [], taskDatabaseIds: [] },
          libraryView: view,
          version: 3,
          workspaceLayouts: {},
        }).libraryView,
        view,
      );
    }
  });

  test("Library lists meetings and its sidebar shortcut opens that tab", async () => {
    const librarySource = await readLibrarySource();
    const sidebarSource = await readSource(
      "/src/features/sidebar/components/sidebar-shortcut-list.tsx",
    );
    const customizeSource = await readSource(
      "/src/features/sidebar/components/sidebar-customize-panel.tsx",
    );
    const iconSource = await readSource(
      "/src/features/sidebar/components/sidebar-layout-icons.tsx",
    );
    const toolbarSource = await readToolbarSource();

    assert.match(librarySource, /homepageViews = libraryViews\.map/);
    assert.match(librarySource, /useWorkspaceMeetings\(/);
    assert.match(librarySource, /fallbackIcon: view\.icon/);
    assert.match(
      toolbarSource,
      /view\.fallbackIcon\s*\?\?\s*getDatabaseViewTypePresentation\(view\.type\)\.Icon/,
    );
    assert.match(customizeSource, /const Icon = libraryViewIcons\[view\]/);
    assert.match(customizeSource, /<Icon \/>\s*\{libraryViewLabels\[view\]\}/);
    assert.doesNotMatch(customizeSource, /onAdd\(\{ route: "meetings", type: "route" \}\)/);
    assert.match(iconSource, /favourites: StarIcon/);
    assert.match(iconSource, /meetings: CalendarDaysIcon/);
    assert.match(iconSource, /private: LockIcon/);
    assert.match(iconSource, /recents: HistoryIcon/);
    assert.match(iconSource, /shared: UsersIcon/);
    assert.match(iconSource, /teamspaces: Layers3Icon/);
    assert.match(
      librarySource,
      /params: \{ meetingId: row\.openMeetingId \}[\s\S]*to: "\/m\/\$meetingId"/,
    );
    assert.match(
      sidebarSource,
      /target\.route === "meetings"[\s\S]*search: \{ view: "meetings" \}[\s\S]*to: "\/recents"/,
    );
  });
}
