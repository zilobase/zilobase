export function register({ readSource, assert, test }) {
  test("sidebar pins the Zilobase logo at the top and workspace switcher at the bottom", async () => {
    const sidebarSource = await readSource("/src/components/app-sidebar.tsx")
    const workspaceSource = await readSource("/src/components/workspace-switcher.tsx")
    const sidebarShellSource = await readSource("/src/app/shell/navigation/app-sidebar-shell.tsx")
    const sidebarPrimitiveSource = await readSource("/src/shared/ui/sidebar.tsx")
    const sidebarTabsSource = await readSource("/src/components/sidebar-layout-tabs.tsx")
    const sidebarCustomizeSource = await readSource("/src/components/sidebar-customize-panel.tsx")
    const sidebarDatabaseViewSource = await readSource("/src/components/sidebar-database-view-section.tsx")
    const navPagesSource = await readSource("/src/components/nav-pages.tsx")
    const navListSource = await readSource("/src/components/sidebar-nav-list.tsx")
    const defaultIconsSource = await readSource("/src/lib/item-icons.ts")
    const pageIconSource = await readSource("/src/lib/page-icon.tsx")
    const databasePageLinkSource = await readSource("/src/editor/extensions/database/interactions/database-page-link.tsx")
    const appIconProviderSource = await readSource("/src/app/providers/app-icon-provider.tsx")
    const iconPickerSource = await readSource("/src/shared/ui/icon-emoji-picker.tsx")

    assert.match(sidebarSource, /<ZilobaseLogo className="h-5 w-auto" \/>/)
    assert.match(sidebarSource, /<span className="sr-only">Zilobase<\/span>/)
    assert.doesNotMatch(sidebarSource, /<NewMenu/)
    assert.match(sidebarSource, /<span>Customize sidebar<\/span>/)
    assert.match(sidebarSource, /<SidebarMenuItem><SidebarMenuButton onClick=\{\(\) => setCustomizing\(true\)\}/)
    assert.match(
      sidebarSource,
      /onClick=\{\(\) => setCustomizing\(true\)\}/,
    )
    assert.match(sidebarSource, /gap-2 p-2/)
    assert.doesNotMatch(navPagesSource, /<span>More<\/span>/)
    assert.match(sidebarPrimitiveSource, /default: "h-7 text-sm"/)
    assert.match(sidebarPrimitiveSource, /font-medium data-active:font-medium text-sidebar-item-foreground ring-ring/)
    assert.doesNotMatch(navListSource, /data-\[active=false\]:opacity-80/)
    assert.match(navListSource, /flex min-w-0 flex-col gap-px/)
    assert.match(defaultIconsSource, /data-icon-color="gray"/)
    assert.doesNotMatch(defaultIconsSource, /data-icon-color="default"/)
    assert.match(defaultIconsSource, /data-icon-library="phosphor"/)
    assert.match(defaultIconsSource, /data-icon-weight="bold"/)
    assert.match(defaultIconsSource, /viewBox="0 0 256 256"/)
    assert.equal(defaultIconsSource.match(/buildPhosphorFallbackIcon\(/g)?.length, 4)
    assert.match(appIconProviderSource, /weight: "bold"/)
    assert.match(iconPickerSource, /useState<PhosphorPickerWeight>\("bold"\)/)
    assert.doesNotMatch(defaultIconsSource, /stroke-width=/)
    assert.match(pageIconSource, /export function DefaultPageIcon/)
    assert.match(pageIconSource, /getPageEmoji\(page\) \?\? DEFAULT_PAGE_ITEM_ICON/)
    assert.match(databasePageLinkSource, /<DefaultPageIcon \/>/)
    assert.doesNotMatch(databasePageLinkSource, /<FileText \/>/)
    assert.match(sidebarTabsSource, /<SearchIcon className="size-4" \/>/)
    assert.match(sidebarTabsSource, /\{active \? <motion\.span/)
    assert.match(sidebarTabsSource, /tabLabelVariants/)
    assert.match(sidebarTabsSource, /editing && active && activeTabSettings/)
    assert.match(sidebarTabsSource, /useSortable/)
    assert.match(sidebarTabsSource, /horizontalListSortingStrategy/)
    assert.match(sidebarTabsSource, /translate3d\(\$\{sortable\.transform\.x\}px, 0, 0\)/)
    assert.match(sidebarTabsSource, /activationConstraint: \{ distance: 4 \}/)
    assert.match(sidebarCustomizeSource, /activeTabSettings=/)
    assert.match(sidebarSource, /<SidebarCustomizePanel activeTabId=\{activeTabId\}/)
    assert.doesNotMatch(sidebarSource, /<SidebarCustomizePanel activeTabId=\{activeTab\.id\}/)
    assert.doesNotMatch(sidebarCustomizeSource, /autoFocus=\{newTabId/)
    assert.match(sidebarCustomizeSource, /<IconEmojiPicker allowUpload=\{false\}/)
    assert.match(sidebarCustomizeSource, /aria-label="Change shortcut icon"/)
    assert.match(sidebarCustomizeSource, /<SidebarShortcutIcon shortcut=\{shortcut\}/)
    assert.doesNotMatch(sidebarCustomizeSource, /editor-icon-button/)
    assert.match(sidebarCustomizeSource, /group\/editor-row/)
    assert.match(sidebarCustomizeSource, /data-\[state=open\]:opacity-100/)
    assert.match(
      sidebarCustomizeSource,
      /data-\[state=open\]:bg-accent data-\[state=open\]:text-accent-foreground/,
    )
    assert.match(sidebarCustomizeSource, /data-sidebar-customize-action/)
    assert.doesNotMatch(sidebarCustomizeSource, />Move left</)
    assert.doesNotMatch(sidebarCustomizeSource, />Move right</)
    assert.match(sidebarCustomizeSource, /onReorderTab=\{reorderTabs\}/)
    assert.match(sidebarCustomizeSource, /<AlertDialog onOpenChange=\{setDeleteTabDialogOpen\}/)
    assert.match(sidebarCustomizeSource, /<AlertDialogTitle>Delete “\{activeTab\.name/)
    assert.match(sidebarCustomizeSource, /<AlertDialogAction onClick=\{deleteTab\} variant="destructive">/)
    assert.doesNotMatch(sidebarCustomizeSource, /window\.confirm\("Remove this tab/)
    assert.match(sidebarCustomizeSource, /EditableRowMenuContext/)
    assert.match(sidebarCustomizeSource, /sortable\.isDragging \|\| sortable\.isOver \|\| menuOpen/)
    assert.match(sidebarCustomizeSource, /verticalListSortingStrategy/)
    assert.match(sidebarCustomizeSource, /group\/editor-row relative cursor-grab/)
    assert.match(sidebarCustomizeSource, /flex h-8 w-full items-center gap-2 rounded-md p-2 pr-8/)
    assert.match(sidebarCustomizeSource, /absolute right-1 top-1\.5 inline-flex size-5/)
    const addShortcutMenu = sidebarCustomizeSource.slice(
      sidebarCustomizeSource.indexOf("function AddShortcutMenu"),
      sidebarCustomizeSource.indexOf("function AddSectionMenu"),
    )
    assert.match(addShortcutMenu, /return \(\s*<DropDrawer>/)
    assert.doesNotMatch(addShortcutMenu, /defaultSubDisplayMode="inline"/)
    assert.match(addShortcutMenu, /<PageShortcutPicker/)
    assert.match(addShortcutMenu, /<DatabasePicker/)
    assert.doesNotMatch(addShortcutMenu, /<SearchablePicker/)
    assert.match(sidebarCustomizeSource, /useAppSearchResults\(/)
    assert.match(sidebarCustomizeSource, /sticky top-0 z-10 shrink-0 bg-popover/)
    assert.match(sidebarCustomizeSource, /overflow-y-auto overscroll-contain/)
    assert.match(sidebarCustomizeSource, /getPageIconNode\(page\)/)
    assert.match(sidebarCustomizeSource, /getDatabaseIconNode\(database\)/)
    assert.match(sidebarCustomizeSource, /<Collapsible onOpenChange=\{setOpen\} open=\{open\}>/)
    assert.match(sidebarCustomizeSource, /database\.views\.map\(\(view\) =>/)
    assert.match(sidebarSource, /function RuntimeSectionDragItem/)
    assert.match(sidebarSource, /<SortableContext items=\{activeTab\.sections/)
    assert.match(sidebarSource, /closest\('\[data-sidebar="group-label"\]'\)/)
    assert.match(sidebarSource, /translate3d\(0, \$\{sortable\.transform\.y\}px, 0\)/)
    assert.match(sidebarPrimitiveSource, /<SidebarSimpleIcon className="size-4" \/>/)
    assert.match(sidebarPrimitiveSource, /variant="ghost"[\s\S]*size="icon"/)
    assert.doesNotMatch(sidebarShellSource, /<SidebarTrigger[^>]*\[&_svg\]:size-/)
    assert.doesNotMatch(sidebarShellSource, /<SidebarTrigger[^>]*(size-7|hover:bg-accent)/)
    assert.doesNotMatch(
      sidebarShellSource,
      /group\/workspace-row|hover:bg-accent focus-within:bg-accent/,
    )
    assert.match(sidebarShellSource, /navigation \? <div className="-mx-2">/)
    const headerStart = sidebarSource.indexOf("<AppSidebarHeader")
    const contentStart = sidebarSource.indexOf("<SidebarContent>")
    const footerStart = sidebarSource.indexOf("<SidebarFooter")
    const logoPosition = sidebarSource.indexOf("<ZilobaseLogo", headerStart)
    const workspaceSwitcherPosition = sidebarSource.indexOf(
      "<WorkspaceSwitcher",
      headerStart,
    )

    assert.ok(
      logoPosition > headerStart && logoPosition < contentStart,
      "Zilobase logo must stay in the sidebar header",
    )
    assert.ok(
      workspaceSwitcherPosition > footerStart,
      "Workspace switcher must stay in the sidebar footer",
    )
    assert.ok(
      sidebarSource.indexOf("<span>Customize sidebar</span>") <
        sidebarSource.indexOf("Open in desktop app"),
      "Customize sidebar must stay above the desktop-app card",
    )
    assert.match(
      sidebarSource,
      /useWorkspaceMeetings\(needsMeetings \? workspaceId : null/,
    )
    assert.match(
      sidebarSource,
      /usePageNavigation\(workspaceId\)/,
    )
    assert.doesNotMatch(sidebarSource, /useCreateAiChatThread/)
    assert.match(sidebarSource, /setActiveThreadId\(null\)/)
    assert.match(
      sidebarSource,
      /<SidebarMenuButton isActive=\{isShortcutActive/,
    )
    assert.match(
      sidebarDatabaseViewSource,
      /activeDataSourceId = database\.data\?\.activeDataSource\?\.id \?\? null/,
    )
    assert.match(
      sidebarDatabaseViewSource,
      /addRow\.mutate\(\s*\{ databaseId: activeDataSourceId, title: "Untitled" \}/,
    )
    assert.doesNotMatch(
      sidebarDatabaseViewSource,
      /addRow\.mutate\(\s*\{ databaseId: section\.databaseId/,
    )
    assert.match(
      sidebarSource,
      /<SidebarDatabaseViewSection activePageId=\{getActivePageId\(pathname\)\}/,
    )
    assert.match(
      sidebarDatabaseViewSource,
      /<SidebarMenuButton asChild isActive=\{row\.pageId === activePageId\}>/,
    )
    assert.match(sidebarShellSource, /Light[\s\S]*Dark[\s\S]*System/)
    assert.match(sidebarSource, /<AppSidebarHeader[\s\S]*navigation=\{!customizing \? <SidebarLayoutTabs/)
    assert.match(workspaceSource, /<span>Settings<\/span>/)
    assert.match(workspaceSource, /Add workspace[\s\S]*WorkspaceSettingsItem/)
  })
}
