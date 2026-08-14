import { readFile } from "node:fs/promises"

export function register({ assert, loadModule, test }) {
  test("desktop tabs close safely and persist drag reordering", async () => {
    const {
      closeDesktopTabState,
      setDesktopTabOrderState,
      useAppStore,
    } = await loadModule("/src/stores/app-store.ts")
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
        { href: "/dashboard", icon: null, id: "one", title: "Home" },
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

  test("desktop tabs share the titlebar and shrink before overflowing", async () => {
    const tabsSource = await readFile(
      new URL("../src/components/desktop-tabs.tsx", import.meta.url),
      "utf8",
    )
    const titlebarSource = await readFile(
      new URL("../src/components/desktop-window-titlebar.tsx", import.meta.url),
      "utf8",
    )
    const sidebarSource = await readFile(
      new URL("../src/components/app-sidebar-shell.tsx", import.meta.url),
      "utf8",
    )
    const appSource = await readFile(
      new URL("../src/App.tsx", import.meta.url),
      "utf8",
    )

    assert.match(tabsSource, /data-desktop-tab-strip/)
    assert.match(tabsSource, /flex-\[1_1_15rem\]/)
    assert.match(tabsSource, /min-w-12 max-w-60/)
    assert.match(tabsSource, /titleTruncated/)
    assert.doesNotMatch(tabsSource, /overflow-x-auto/)
    assert.match(titlebarSource, /\{children\}/)
    assert.match(titlebarSource, /aria-label="Window controls"/)
    assert.doesNotMatch(sidebarSource, /top: "1\.75rem"/)
    assert.match(sidebarSource, /navigator\.userAgent\.includes\("Linux"\)/)
    assert.match(appSource, /variant="fallback"/)
    assert.match(appSource, /data-desktop-linux-shell/)
  })
}
