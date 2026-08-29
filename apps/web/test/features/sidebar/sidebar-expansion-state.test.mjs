export function register({ assert, loadModule, test }) {
  test("sidebar expansion is scoped by workspace and section", async () => {
    const { getSidebarExpansionStorageKey } = await loadModule(
      "/src/components/sidebar-expansion-state.ts",
    )

    assert.equal(
      getSidebarExpansionStorageKey("workspace/one", "private"),
      "zilobase:sidebar-tree:v1:workspace%2Fone:private",
    )
    assert.notEqual(
      getSidebarExpansionStorageKey("workspace/one", "private"),
      getSidebarExpansionStorageKey("workspace/one", "favorites"),
    )
    assert.notEqual(
      getSidebarExpansionStorageKey("workspace/one", "private"),
      getSidebarExpansionStorageKey("workspace/two", "private"),
    )
  })

  test("sidebar expansion safely round trips expanded items", async () => {
    const {
      readExpandedSidebarItems,
      setSidebarItemExpanded,
      writeExpandedSidebarItems,
    } = await loadModule("/src/components/sidebar-expansion-state.ts")
    const values = new Map()
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }
    const storageKey = "sidebar-test"

    let expanded = setSidebarItemExpanded(new Set(), "parent", true)
    expanded = setSidebarItemExpanded(expanded, "child", true)
    expanded = setSidebarItemExpanded(expanded, "parent", false)
    writeExpandedSidebarItems(storageKey, expanded, storage)

    assert.deepEqual(readExpandedSidebarItems(storageKey, storage), [
      "child",
    ])
  })

  test("sidebar expansion ignores invalid or unavailable storage", async () => {
    const { readExpandedSidebarItems } = await loadModule(
      "/src/components/sidebar-expansion-state.ts",
    )
    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }

    assert.deepEqual(
      readExpandedSidebarItems("missing", blockedStorage),
      [],
    )
  })
}
