export function register({ readSource, assert, loadModule, test }) {
  test("database table columns use fixed defaults and a flexible trailing filler", async () => {
    const {
      databaseAddPropertyColumnDefaultWidth,
      databaseColumnDefaultWidth,
      databaseNameColumnDefaultWidth,
    } = await loadModule(
      "/src/features/editor/extensions/database/core/database-contracts.ts"
    )
    const tableSource = await readSource("/src/features/editor/extensions/database/views/table/database-table-view.tsx")

    assert.equal(databaseColumnDefaultWidth, 200)
    assert.equal(databaseNameColumnDefaultWidth, databaseColumnDefaultWidth * 1.25)
    assert.equal(databaseAddPropertyColumnDefaultWidth, databaseColumnDefaultWidth)
    assert.match(tableSource, /key === ADD_PROPERTY_COLUMN_ID\s*\? undefined\s*:\s*\{ width: getColumnWidth/)
  })

  test("add-property menu opens below the property insertion point", async () => {
    const menuSource = await readSource("/src/features/editor/extensions/database/properties/add-database-property-menu.tsx")

    assert.match(menuSource, /<DropDrawerContent\s+align="start"/)
  })

  test("database table drop targeting uses row midpoints", async () => {
    const { getDatabaseRowDropTargetIndex } = await loadModule(
      "/src/features/editor/extensions/database/interactions/database-table-layout.ts"
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
      "/src/features/editor/extensions/database/interactions/database-table-layout.ts"
    )

    assert.equal(getDatabaseRowDropTargetIndex([], 10), 0)
    assert.equal(getDatabaseRowDropTargetIndex([0], 10), 0)
  })

  test("database table final-row drops use the line above the New page footer", async () => {
    const { getDatabaseRowDropTarget } = await loadModule(
      "/src/features/editor/extensions/database/interactions/database-table-layout.ts"
    )
    const dropTops = [0, 40, 100, 130]

    assert.deepEqual(getDatabaseRowDropTarget(dropTops, 160), {
      index: 3,
      lineTop: 130,
    })
  })

  test("database table empty-state drops use the measured New page top", async () => {
    const { getDatabaseRowDropTarget } = await loadModule(
      "/src/features/editor/extensions/database/interactions/database-table-layout.ts"
    )

    assert.deepEqual(getDatabaseRowDropTarget([32], 80), {
      index: 0,
      lineTop: 32,
    })
    assert.equal(getDatabaseRowDropTarget([], 80), null)
  })
}
