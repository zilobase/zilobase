export function register({ assert, loadModule, test }) {
  test("sidebar section configuration sorts and limits items", async () => {
    const { getConfiguredSidebarItems } = await loadModule(
      "/src/features/sidebar/model/sidebar-section-items.ts",
    )
    const items = [
      {
        id: "1",
        lastVisitedAt: "2026-08-03T00:00:00Z",
        name: "Zulu",
        updatedAt: "2026-08-01T00:00:00Z",
      },
      {
        id: "2",
        lastVisitedAt: "2026-08-01T00:00:00Z",
        name: "alpha",
        updatedAt: "2026-08-03T00:00:00Z",
      },
      {
        id: "3",
        lastVisitedAt: "2026-08-02T00:00:00Z",
        name: "Beta",
        updatedAt: "2026-08-02T00:00:00Z",
      },
    ]
    const config = {
      sectionLimits: { recents: 10, favorites: 10, private: 5, shared: 10 },
      sectionSorts: {
        recents: "lastEdited",
        favorites: "lastEdited",
        private: "alphabetical",
        shared: "lastEdited",
      },
    }

    assert.deepEqual(
      getConfiguredSidebarItems(items, "recents", config).map(
        (item) => item.id,
      ),
      ["1", "3", "2"],
    )
    assert.deepEqual(
      getConfiguredSidebarItems(items, "private", config).map(
        (item) => item.id,
      ),
      ["2", "3", "1"],
    )
    assert.deepEqual(
      getConfiguredSidebarItems(items, "shared", {
        ...config,
        sectionLimits: { ...config.sectionLimits, shared: 2 },
      }).map((item) => item.id),
      ["2", "3"],
    )
  })
}
