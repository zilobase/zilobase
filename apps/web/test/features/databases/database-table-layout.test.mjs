export function register({ readSource, assert, loadModule, test }) {
  test("database table columns share one explicit sizing model", async () => {
    const {
      databaseAddPropertyColumnDefaultWidth,
      databaseColumnDefaultWidth,
      databaseNameColumnDefaultWidth,
    } = await loadModule(
      "/src/features/databases/views/model/column-dimensions.ts"
    )
    const tableSource = await readSource("/src/features/databases/views/table/components/database-table-shell.tsx")
    const tableViewSource = await readSource("/src/features/databases/views/table/components/database-table-view.tsx")

    assert.equal(databaseColumnDefaultWidth, 200)
    assert.equal(databaseNameColumnDefaultWidth, databaseColumnDefaultWidth * 1.25)
    assert.equal(databaseAddPropertyColumnDefaultWidth, databaseColumnDefaultWidth)
    assert.match(tableSource, /style=\{\{ width: getColumnWidth\(columnWidths, key\) \}\}/)
    assert.doesNotMatch(tableSource, /key === ADD_PROPERTY_COLUMN_ID\s*\? undefined/)
    assert.match(tableSource, /\{header\}\s*<tbody>/)
    assert.match(tableViewSource, /header=\{renderTableHeader\("table"\)\}/)
  })

  test("add-property menu opens below the property insertion point", async () => {
    const menuSource = await readSource("/src/features/databases/schema/editors/add-database-property-menu.tsx")

    assert.match(menuSource, /<DropDrawerContent\s+align="start"/)
  })

  test("database table drop targeting uses row midpoints", async () => {
    const { getDatabaseRowDropTargetIndex } = await loadModule(
      "/src/features/databases/interactions/database-table-layout.ts"
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
      "/src/features/databases/interactions/database-table-layout.ts"
    )

    assert.equal(getDatabaseRowDropTargetIndex([], 10), 0)
    assert.equal(getDatabaseRowDropTargetIndex([0], 10), 0)
  })

  test("database table final-row drops use the line above the New page footer", async () => {
    const { getDatabaseRowDropTarget } = await loadModule(
      "/src/features/databases/interactions/database-table-layout.ts"
    )
    const dropTops = [0, 40, 100, 130]

    assert.deepEqual(getDatabaseRowDropTarget(dropTops, 160), {
      index: 3,
      lineTop: 130,
    })
  })

  test("database table empty-state drops use the measured New page top", async () => {
    const { getDatabaseRowDropTarget } = await loadModule(
      "/src/features/databases/interactions/database-table-layout.ts"
    )

    assert.deepEqual(getDatabaseRowDropTarget([32], 80), {
      index: 0,
      lineTop: 32,
    })
    assert.equal(getDatabaseRowDropTarget([], 80), null)
  })
}
