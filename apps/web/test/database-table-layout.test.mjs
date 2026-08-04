export function register({ assert, loadModule, test }) {
  test("database table drop targeting uses row midpoints", async () => {
    const { getDatabaseRowDropTargetIndex } = await loadModule(
      "/src/editor/extensions/database/interactions/database-table-layout.ts"
    )
    const dropTops = [0, 40, 100, 130]

    assert.equal(getDatabaseRowDropTargetIndex(dropTops, -10), 0)
    assert.equal(getDatabaseRowDropTargetIndex(dropTops, 19), 0)
    assert.equal(getDatabaseRowDropTargetIndex(dropTops, 20), 1)
    assert.equal(getDatabaseRowDropTargetIndex(dropTops, 69), 1)
    assert.equal(getDatabaseRowDropTargetIndex(dropTops, 70), 2)
    assert.equal(getDatabaseRowDropTargetIndex(dropTops, 115), 3)
    assert.equal(getDatabaseRowDropTargetIndex(dropTops, 200), 3)
  })

  test("database table drop targeting handles an empty layout", async () => {
    const { getDatabaseRowDropTargetIndex } = await loadModule(
      "/src/editor/extensions/database/interactions/database-table-layout.ts"
    )

    assert.equal(getDatabaseRowDropTargetIndex([], 10), 0)
    assert.equal(getDatabaseRowDropTargetIndex([0], 10), 0)
  })

  test("database table final-row drops use the line above the New page footer", async () => {
    const { getDatabaseRowDropTarget } = await loadModule(
      "/src/editor/extensions/database/interactions/database-table-layout.ts"
    )
    const dropTops = [0, 40, 100, 130]

    assert.deepEqual(getDatabaseRowDropTarget(dropTops, 160), {
      index: 3,
      lineTop: 130,
    })
  })

  test("database table empty-state drops use the measured New page top", async () => {
    const { getDatabaseRowDropTarget } = await loadModule(
      "/src/editor/extensions/database/interactions/database-table-layout.ts"
    )

    assert.deepEqual(getDatabaseRowDropTarget([32], 80), {
      index: 0,
      lineTop: 32,
    })
    assert.equal(getDatabaseRowDropTarget([], 80), null)
  })
}
