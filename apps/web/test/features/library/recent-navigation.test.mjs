export function register({ assert, loadModule, test }) {
  test("startup opens the most recently visited active item", async () => {
    const { getMostRecentItemPath } = await loadModule(
      "/src/features/library/model/recent-navigation.ts",
    )
    const navigation = {
      pages: [
        createItem("older-page", "2026-08-12T08:00:00.000Z"),
        {
          ...createItem("deleted-page", "2026-08-14T09:00:00.000Z"),
          deletedAt: "2026-08-14T10:00:00.000Z",
        },
      ],
      databases: [
        createItem("latest-database", "2026-08-13T08:00:00.000Z"),
      ],
    }

    assert.equal(getMostRecentItemPath(navigation), "/d/latest-database")
    assert.equal(
      getMostRecentItemPath({
        databases: [],
        pages: [createItem("never-opened", null)],
      }),
      null,
    )
  })
}

function createItem(id, lastVisitedAt) {
  return { id, lastVisitedAt }
}
