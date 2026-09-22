export function register({ readSource, assert, loadModule, test }) {
  test("desktop tabs close safely and persist drag reordering", async () => {
    const {
      closeDesktopTabState,
      setDesktopTabOrderState,
      useAppStore,
    } = await loadModule("/src/features/desktop/state/app-store.ts")
    const tabs = [
      { href: "/p/one", id: "one", title: "One" },
      { href: "/p/two", id: "two", title: "Two" },
      { href: "/p/three", id: "three", title: "Three" },
    ]

    const middleClosed = closeDesktopTabState(
      { activeDesktopTabId: "two", desktopTabs: tabs },
      "two",
    )
    assert.equal(middleClosed.activeDesktopTabId, "three")
    assert.deepEqual(
      middleClosed.desktopTabs.map((tab) => tab.id),
      ["one", "three"],
    )

    const lastClosed = closeDesktopTabState(
      { activeDesktopTabId: "one", desktopTabs: [tabs[0]] },
      "one",
    )
    assert.deepEqual(lastClosed, {
      activeDesktopTabId: "one",
      desktopTabs: [
        { href: "/recents", icon: null, id: "one", title: "Recents" },
      ],
    })

    const reordered = setDesktopTabOrderState(
      { activeDesktopTabId: "two", desktopTabs: tabs },
      ["two", "three", "one"],
    )
    assert.deepEqual(
      reordered.desktopTabs.map((tab) => tab.id),
      ["two", "three", "one"],
    )
    assert.equal(reordered.activeDesktopTabId, "two")
    assert.equal(
      setDesktopTabOrderState(reordered, ["two", "three", "one"]),
      reordered,
    )

    useAppStore.setState({
      activeDesktopTabId: "two",
      activeWorkspaceId: "workspace-one",
      desktopTabs: tabs,
    })
    useAppStore.getState().resetAccountState()
    assert.deepEqual(
      {
        activeDesktopTabId: useAppStore.getState().activeDesktopTabId,
        activeWorkspaceId: useAppStore.getState().activeWorkspaceId,
        desktopTabs: useAppStore.getState().desktopTabs,
      },
      {
        activeDesktopTabId: null,
        activeWorkspaceId: null,
        desktopTabs: [],
      },
    )
  })

  test("desktop tabs keep the trailing action stable through drag settling", async () => {
    const tabsSource = await readSource("/src/features/desktop/components/desktop-tabs.tsx")
    const tabStripSource = await readSource("/src/features/desktop/components/desktop-tab-strip.tsx")
    const titlebarSource = await readSource("/src/features/desktop/components/desktop-window-titlebar.tsx")
    const sidebarSource = await readSource("/src/features/sidebar/app-sidebar.tsx")
    const appSource = await readSource("/src/app/app.tsx")
    const stylesSource = await readSource("/src/shared/styles/global.css")

    assert.match(tabsSource, /DesktopTabStrip/)
    assert.match(tabStripSource, /data-desktop-tab-strip/)
    assert.match(tabStripSource, /flex-\[1_1_14rem\]/)
    assert.match(tabStripSource, /min-w-12 max-w-56/)
    assert.match(tabStripSource, /gap-2\.5/)
    assert.match(tabStripSource, /rounded-t-md/)
    assert.match(tabStripSource, /desktop-tab-inactive rounded-b-md/)
    assert.match(tabStripSource, /onPointerEnter=\{onPreload\}/)
    assert.match(tabStripSource, /onPointerDown=\{\(event\) => \{/)
    assert.match(tabStripSource, /motion\.button/)
    assert.match(tabStripSource, /layout="position"/)
    assert.match(tabStripSource, /onDragTransitionEnd/)
    assert.match(tabStripSource, /useMotionValueEvent/)
    assert.match(tabStripSource, /draggingTabId \? "overflow-visible" : "overflow-hidden"/)
    assert.match(tabStripSource, /onPointerDown=\{stopReorderPointerDown\}/)
    assert.match(tabStripSource, /titleTruncated/)
    assert.doesNotMatch(tabStripSource, /onDragEnd=\{/)
    assert.doesNotMatch(tabStripSource, /left-\[calc\(100%/)
    assert.doesNotMatch(tabStripSource, /overflow-x-auto/)
    assert.match(stylesSource, /--desktop-tab-trailing-width: 3\.25rem/)
    assert.match(stylesSource, /--desktop-tab-slot-width: 14\.625rem/)
    assert.match(stylesSource, /\.desktop-tab-active::before/)
    assert.match(stylesSource, /\.desktop-tab-active::after/)
    assert.match(stylesSource, /\.desktop-tab-inactive:has\(\+ \.desktop-tab-inactive\)::after/)
    assert.match(tabsSource, /router\.preloadRoute/)
    assert.match(tabsSource, /pendingNavigation\.current/)
    assert.match(tabsSource, /event\.key === "Tab"/)
    assert.match(titlebarSource, /\{children\}/)
    assert.match(titlebarSource, /aria-label="Window controls"/)
    assert.doesNotMatch(sidebarSource, /top: "1\.75rem"/)
    assert.match(sidebarSource, /navigator\.userAgent\.includes\("Linux"\)/)
    assert.match(appSource, /variant="fallback"/)
    assert.match(appSource, /data-desktop-linux-shell/)
  })
}
