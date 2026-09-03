export function register({ readSource, assert, test }) {
  test("sidebar pins the Zilobase logo at the top and workspace switcher at the bottom", async () => {
    const sidebarSource = await readSource("/src/features/sidebar/app-sidebar.tsx")
    const themeSource = await readSource("/src/features/sidebar/components/sidebar-theme-switcher.tsx")
    const workspaceSource = await readSource("/src/features/sidebar/workspace-switcher.tsx")
    const sidebarPrimitiveSource = await readSource("/src/shared/ui/sidebar.tsx")
    const sidebarTabsSource = await readSource("/src/features/sidebar/components/sidebar-layout-tabs.tsx")
    const sidebarCustomizeSource = await readSource("/src/features/sidebar/components/sidebar-customize-panel.tsx")
    const runtimeSectionDragSource = await readSource(
      "/src/features/sidebar/components/runtime-section-drag-item.tsx",
    )
    const sidebarShortcutSource = await readSource(
      "/src/features/sidebar/components/sidebar-shortcut-list.tsx",
    )
    const sidebarDatabaseViewSource = await readSource("/src/features/sidebar/components/sidebar-database-view-section.tsx")
    const navPagesSource = await readSource("/src/features/sidebar/components/nav-pages.tsx")
    const navListSource = await readSource("/src/features/sidebar/components/sidebar-nav-list.tsx")
    const defaultIconsSource = await readSource("/src/features/pages/icons/item-icons.ts")
    const pageIconSource = await readSource("/src/features/pages/icons/page-icon.tsx")
    const databasePageLinkSource = await readSource("/src/features/databases/interactions/database-page-link.tsx")
    const appIconProviderSource = await readSource("/src/shared/components/app-icon-provider.tsx")
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
    assert.match(sidebarPrimitiveSource, /flex h-8 w-full items-center/)
    assert.match(sidebarPrimitiveSource, /text-sm font-medium text-content-secondary ring-action-focus-ring/)
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
    assert.doesNotMatch(sidebarCustomizeSource, /managed by Zilobase|<StaticTabContents/)
    assert.match(sidebarCustomizeSource, /tabId === "mail"[\s\S]*mailViewIds\.map/)
    assert.match(sidebarCustomizeSource, /Compose is required/)
    assert.match(sidebarCustomizeSource, /isFixedSidebarTabId\(current\.tabs\[from\]!\.id\)/)
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
      /data-\[state=open\]:bg-action-neutral-hover data-\[state=open\]:text-action-on-neutral/,
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
    assert.match(sidebarCustomizeSource, /sticky top-0 z-10 shrink-0 bg-surface-overlay/)
    assert.match(sidebarCustomizeSource, /overflow-y-auto overscroll-contain/)
    assert.match(sidebarCustomizeSource, /getPageIconNode\(page\)/)
    assert.match(sidebarCustomizeSource, /getDatabaseIconNode\(database\)/)
    assert.match(sidebarCustomizeSource, /<Collapsible onOpenChange=\{setOpen\} open=\{open\}>/)
    assert.match(sidebarCustomizeSource, /database\.views\.map\(\(view\) =>/)
    assert.match(runtimeSectionDragSource, /function RuntimeSectionDragItem/)
    assert.match(sidebarSource, /<SortableContext items=\{activeTab\.sections/)
    assert.match(runtimeSectionDragSource, /closest\('\[data-sidebar="group-label"\]'\)/)
    assert.match(runtimeSectionDragSource, /translate3d\(0, \$\{sortable\.transform\.y\}px, 0\)/)
    assert.match(sidebarPrimitiveSource, /<SidebarSimpleIcon className="size-4" \/>/)
    assert.match(sidebarPrimitiveSource, /variant="ghost"[\s\S]*size="icon"/)
    assert.doesNotMatch(sidebarSource, /<SidebarTrigger[^>]*\[&_svg\]:size-/)
    assert.doesNotMatch(sidebarSource, /<SidebarTrigger[^>]*(size-7|hover:bg-action-neutral-hover)/)
    assert.doesNotMatch(
      sidebarSource,
      /group\/workspace-row|hover:bg-action-neutral-hover focus-within:bg-action-neutral-hover/,
    )
    assert.match(sidebarPrimitiveSource, /navigation \? <div className="-mx-2">/)
    const headerStart = sidebarSource.indexOf("<SidebarHeader")
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
    assert.match(sidebarSource, /tabId === "mail"[\s\S]*search: \{ view: "inbox" \}[\s\S]*to: "\/mail"/)
    assert.match(sidebarSource, /tabId === "ai"[\s\S]*activeThreadId \?\? undefined[\s\S]*to: "\/ai"/)
    assert.match(sidebarSource, /staticTabId = pathname === "\/mail" \? "mail" : pathname === "\/ai" \? "ai" : null/)
    assert.match(sidebarSource, /!staticTabId && isStaticSidebarTabId\(activeTabId\)[\s\S]*readActiveSidebarTab\(workspaceId\)/)
    assert.match(
      sidebarShortcutSource,
      /<SidebarMenuButton[\s\S]*isActive=\{isShortcutActive/,
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
    assert.match(themeSource, /Light[\s\S]*Dark[\s\S]*System/)
    assert.match(sidebarSource, /<SidebarHeader[\s\S]*navigation=\{!customizing \? <SidebarLayoutTabs/)
    assert.match(workspaceSource, /<span>Settings<\/span>/)
    assert.match(workspaceSource, /Add workspace[\s\S]*WorkspaceSettingsItem/)
  })
}
