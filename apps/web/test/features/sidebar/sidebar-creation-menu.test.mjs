export function register({ readSource, assert, test }) {
  test("sidebar composes tabs, shortcuts, sections and footer around controller props", async () => {
    const source = await readSource("/src/app/shell/sidebar/components/app-sidebar.tsx");
    const controller = await readSource("/src/app/shell/sidebar/hooks/sidebar-controller.ts");
    const customization = await readSource(
      "/src/app/shell/sidebar/components/sidebar-customization.tsx",
    );
    assert.match(source, /function AppSidebar\(sidebar: AppSidebarProps\)/);
    assert.doesNotMatch(source, /usePageNavigation\(|useWorkspaceMeetings\(|useDatabaseRecords\(/);
    assert.match(controller, /usePageNavigation\(workspaceId\)/);
    assert.match(controller, /useWorkspaceMeetings\(needsMeetings \? workspaceId : null/);
    assert.match(controller, /activeDataSourceId && activeView/);
    assert.match(controller, /useTaskDatabases\(databaseIds\)/);
    assert.match(source, /<SidebarLayoutTabs/);
    assert.match(customization, /horizontalListSortingStrategy/);
    assert.match(customization, /editing && active && activeTabSettings/);
    assert.match(source, /items=\{activeTab.sections.map/);
    assert.match(source, /closest\('\[data-sidebar="group-label"\]'\)/);
    assert.match(source, /<SidebarCustomizePanel/);
    assert.ok(source.indexOf("<SidebarShortcutList") < source.indexOf("<SidebarContent"));
    assert.ok(source.indexOf("<WorkspaceSwitcher") < source.indexOf("<SidebarContent"));
    assert.ok(source.indexOf("<NotificationCenter") < source.indexOf("<SidebarContent"));
    assert.ok(source.indexOf("Customize sidebar") < source.indexOf("Open in desktop app"));
    assert.match(source, /No AI chats yet/);
    assert.doesNotMatch(
      source,
      /NavFavorites|NavPageSection|NavMeetings|SidebarDatabaseViewSection/,
    );
  });
  test("sidebar uses the shared default page and database icon conventions", async () => {
    const defaultIconsSource = await readSource(
      "/src/components/navigation/lib/navigation-icons.ts",
    );
    const appIconProviderSource = await readSource("/src/components/icons.ts");
    const pageIconSource = await readSource(
      "/src/sections/pages/appearance/components/page-icon.tsx",
    );
    const databasePageLinkSource = await readSource(
      "/src/sections/databases/interactions/components/database-page-link.tsx",
    );
    const iconPickerSource = await readSource("/src/components/ui/icon-emoji-picker.tsx");
    const phosphorIconPickerSource = await readSource(
      "/src/components/ui/phosphor-icon-picker.tsx",
    );
    assert.match(defaultIconsSource, /data-icon-color="gray"/);
    assert.doesNotMatch(defaultIconsSource, /data-icon-color="default"/);
    assert.match(defaultIconsSource, /data-icon-library="phosphor"/);
    assert.match(defaultIconsSource, /data-icon-weight="bold"/);
    assert.match(defaultIconsSource, /viewBox="0 0 256 256"/);
    assert.equal(defaultIconsSource.match(/buildPhosphorFallbackIcon\(/g)?.length, 5);
    assert.match(appIconProviderSource, /weight: "bold"/);
    assert.doesNotMatch(iconPickerSource, /Icon weight|PhosphorPickerWeight|iconWeight/);
    assert.equal(phosphorIconPickerSource.match(/weight="fill"/g)?.length, 2);
    assert.doesNotMatch(phosphorIconPickerSource, /PhosphorPickerWeight/);
    assert.doesNotMatch(defaultIconsSource, /stroke-width=/);
    assert.match(pageIconSource, /export function DefaultPageIcon/);
    assert.match(pageIconSource, /getDefaultPageIconValue\(page\)/);
    assert.match(databasePageLinkSource, /<DefaultPageIcon page=\{pageSummary\} \/>/);
    assert.doesNotMatch(databasePageLinkSource, /<FileText \/>/);
  });
}
