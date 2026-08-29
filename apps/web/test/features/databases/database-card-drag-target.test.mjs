export function register({ readSource, assert, loadModule, test }) {
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
    const editor = {}
    const card = { contains: (candidate) => candidate !== editor }
    assert.equal(
      isInteractiveDatabaseCardTarget({
        closest: (selector) =>
          selector.includes("contenteditable") ? editor : card,
      }),
      false,
    )
    assert.equal(
      isInteractiveDatabaseCardTarget({ closest: () => null }),
      false,
    )
    assert.equal(isInteractiveDatabaseCardTarget(null), false)
  })

  test("gallery and kanban use whole-card dragging in every database mode", async () => {
    const [gallerySource, kanbanSource] = await Promise.all([
      readSource("/src/editor/extensions/database/views/gallery/database-gallery-view.tsx"),
      readSource("/src/editor/extensions/database/views/kanban/database-kanban-view.tsx"),
    ])

    for (const source of [gallerySource, kanbanSource]) {
      assert.match(source, /draggable=\{editable\}/)
      assert.match(source, /onDragStartCapture=/)
      assert.doesNotMatch(source, /fullPage/)
      assert.doesNotMatch(source, /card-drag-handle/)
    }
  })
}
