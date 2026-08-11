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
}
