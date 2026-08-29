export function register({ assert, loadModule, test }) {
  test("database wrap settings use explicit, stable defaults", async () => {
    const {
      getNameColumnWrapContent,
      getPropertyWrapContent,
    } = await loadModule(
      "/src/editor/extensions/database/views/database-view-config.ts"
    )

    assert.equal(getPropertyWrapContent(undefined), false)
    assert.equal(getPropertyWrapContent({ wrapContent: true }), true)
    assert.equal(getPropertyWrapContent({ wrapContent: false }), false)
    assert.equal(getNameColumnWrapContent(undefined), true)
    assert.equal(
      getNameColumnWrapContent({ nameColumn: { wrapContent: false } }),
      false
    )
  })

  test("database wrap setting updates preserve neighboring config", async () => {
    const {
      getMergedNameColumnConfig,
      getMergedPropertyConfig,
    } = await loadModule(
      "/src/editor/extensions/database/views/database-view-config.ts"
    )

    assert.deepEqual(
      getMergedPropertyConfig(
        { showFullUrl: true, wrapContent: false },
        { wrapContent: true }
      ),
      { showFullUrl: true, wrapContent: true }
    )
    assert.deepEqual(
      getMergedNameColumnConfig(
        { emoji: "🗒️", nameColumn: { showPageIcon: false } },
        { wrapContent: false }
      ),
      {
        emoji: "🗒️",
        nameColumn: { showPageIcon: false, wrapContent: false },
      }
    )
  })
}
