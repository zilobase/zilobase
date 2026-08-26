export function register({ assert, loadModule, test }) {
  test("database cards do not start dragging from interactive content", async () => {
    const { isInteractiveDatabaseCardTarget } = await loadModule(
      "/src/editor/extensions/database/interactions/database-card-drag-target.ts",
    )
    const target = (match) => ({
      closest: (selector) => (selector.includes(match) ? {} : null),
    })

    assert.equal(isInteractiveDatabaseCardTarget(target("input")), true)
    assert.equal(
      isInteractiveDatabaseCardTarget(
        target(".database-kanban-card-properties"),
      ),
      false,
    )
    assert.equal(
      isInteractiveDatabaseCardTarget(
        target(".database-gallery-card-properties"),
      ),
      false,
    )
    assert.equal(isInteractiveDatabaseCardTarget(target("button")), false)
    assert.equal(
      isInteractiveDatabaseCardTarget({ closest: () => null }),
      false,
    )
    assert.equal(isInteractiveDatabaseCardTarget(null), false)
  })
}
