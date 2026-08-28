import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("sidebar pins the Zilobase logo at the top and workspace switcher at the bottom", async () => {
    const sidebarSource = await readFile(
      new URL("../src/components/app-sidebar.tsx", import.meta.url),
      "utf8",
    )
    const workspaceSource = await readFile(
      new URL("../src/components/workspace-switcher.tsx", import.meta.url),
      "utf8",
    )
    const sidebarShellSource = await readFile(
      new URL("../src/components/app-sidebar-shell.tsx", import.meta.url),
      "utf8",
    )
    const sidebarTabsSource = await readFile(
      new URL("../src/components/sidebar-layout-tabs.tsx", import.meta.url),
      "utf8",
    )
    const sidebarCustomizeSource = await readFile(
      new URL("../src/components/sidebar-customize-panel.tsx", import.meta.url),
      "utf8",
    )

    assert.match(sidebarSource, /<ZilobaseLogo className="h-5 w-auto" \/>/)
    assert.match(sidebarSource, /<span className="sr-only">Zilobase<\/span>/)
    assert.doesNotMatch(sidebarSource, /<NewMenu/)
    assert.match(sidebarSource, /<span>Customize sidebar<\/span>/)
    assert.match(
      sidebarSource,
      /onClick=\{\(\) => setCustomizing\(true\)\}/,
    )
    assert.match(sidebarSource, /gap-3 px-4 pb-3 pt-2/)
    assert.match(sidebarTabsSource, /<SearchIcon className="size-4" \/>/)
    assert.match(sidebarTabsSource, /\{active \? <motion\.span/)
    assert.match(sidebarTabsSource, /tabLabelVariants/)
    assert.match(sidebarTabsSource, /editing && active && activeTabSettings/)
    assert.match(sidebarTabsSource, /useSortable/)
    assert.match(sidebarTabsSource, /horizontalListSortingStrategy/)
    assert.match(sidebarTabsSource, /translate3d\(\$\{sortable\.transform\.x\}px, 0, 0\)/)
    assert.match(sidebarTabsSource, /activationConstraint: \{ distance: 4 \}/)
    assert.match(sidebarCustomizeSource, /activeTabSettings=/)
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
    assert.match(
      sidebarShellSource,
      /<ThemeSwitcher \/>[\s\S]*<SidebarTrigger[^>]*\[&_svg\]:size-4!/,
    )
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
    assert.match(sidebarShellSource, /Light[\s\S]*Dark[\s\S]*System/)
    assert.match(sidebarSource, /<AppSidebarHeader[\s\S]*navigation=\{!customizing \? <SidebarLayoutTabs/)
    assert.match(workspaceSource, /<span>Settings<\/span>/)
    assert.match(workspaceSource, /Add workspace[\s\S]*WorkspaceSettingsItem/)
  })
}
