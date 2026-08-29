export function register({ assert, loadModule, test }) {
  test("database cell drafts update only the addressed key", async () => {
    const { getUpdatedDatabaseCellDrafts } = await loadModule(
      "/src/editor/extensions/database/views/database-cell-state.tsx"
    )
    const drafts = { "page-1:title": "First", "page-2:title": "Second" }
    const nextDrafts = getUpdatedDatabaseCellDrafts(
      drafts,
      "page-1:title",
      () => "Updated"
    )

    assert.deepEqual(nextDrafts, {
      "page-1:title": "Updated",
      "page-2:title": "Second",
    })
    assert.deepEqual(drafts, {
      "page-1:title": "First",
      "page-2:title": "Second",
    })
  })

  test("database cell draft cleanup preserves unrelated drafts", async () => {
    const { getUpdatedDatabaseCellDrafts } = await loadModule(
      "/src/editor/extensions/database/views/database-cell-state.tsx"
    )

    assert.deepEqual(
      getUpdatedDatabaseCellDrafts(
        { "page-1:title": "First", "page-2:title": "Second" },
        "page-1:title",
        () => undefined
      ),
      { "page-2:title": "Second" }
    )
  })

  test("database property draft cleanup clears every row for the property", async () => {
    const { getDatabaseCellDraftsWithoutProperty } = await loadModule(
      "/src/editor/extensions/database/views/database-cell-state.tsx"
    )

    assert.deepEqual(
      getDatabaseCellDraftsWithoutProperty(
        {
          "page-1:property-date": "2026-07-07",
          "page-2:property-date": "2026-07-08",
          "page-2:property-name": "Second",
        },
        "property-date"
      ),
      { "page-2:property-name": "Second" }
    )
  })
}
