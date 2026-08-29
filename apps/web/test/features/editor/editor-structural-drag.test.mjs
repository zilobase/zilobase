function axisRect(index, left, top, width, height) {
  return { height, index, left, top, width }
}

export function register({ assert, loadModule, test }) {
  test("column drag targets columns by their midpoint", async () => {
    const { getColumnDragTargetIndex } = await loadModule(
      "/src/features/editor/components/editor/column-drag.ts",
    )
    const rect = {
      columns: [
        axisRect(0, 0, 20, 100, 200),
        axisRect(1, 100, 20, 100, 200),
        axisRect(2, 200, 20, 100, 200),
      ],
    }

    assert.equal(getColumnDragTargetIndex(rect, 49), 0)
    assert.equal(getColumnDragTargetIndex(rect, 50), 1)
    assert.equal(getColumnDragTargetIndex(rect, 500), 2)
  })

  test("column drag distinguishes reorder and block extraction zones", async () => {
    const { getColumnExtractionDropPosition } = await loadModule(
      "/src/features/editor/components/editor/column-drag.ts",
    )
    const rect = { height: 200, left: 100, top: 50, width: 300 }

    assert.equal(getColumnExtractionDropPosition(rect, 200, 100), null)
    assert.equal(getColumnExtractionDropPosition(rect, 50, 100), "before")
    assert.equal(getColumnExtractionDropPosition(rect, 450, 200), "after")
  })

  test("table drag targets the segment under the pointer", async () => {
    const { getTableDragTargetIndex } = await loadModule(
      "/src/features/editor/components/editor/table-drag.ts",
    )
    const rect = {
      columns: [
        axisRect(0, 100, 50, 120, 200),
        axisRect(1, 220, 50, 180, 200),
      ],
      rows: [
        axisRect(0, 100, 50, 300, 40),
        axisRect(1, 100, 90, 300, 60),
      ],
    }

    assert.equal(getTableDragTargetIndex(rect, "column", 250, 0), 1)
    assert.equal(getTableDragTargetIndex(rect, "row", 0, 120), 1)
    assert.equal(getTableDragTargetIndex(rect, "row", 0, 200), null)
  })

  test("table drag line follows the destination edge", async () => {
    const { getTableDropLinePosition } = await loadModule(
      "/src/features/editor/components/editor/table-drag.ts",
    )
    const rect = {
      columns: [
        axisRect(0, 100, 50, 120, 200),
        axisRect(1, 220, 50, 180, 200),
      ],
      rows: [
        axisRect(0, 100, 50, 300, 40),
        axisRect(1, 100, 90, 300, 60),
      ],
    }

    assert.equal(
      getTableDropLinePosition(rect, { axis: "column", from: 0, target: 1 }),
      400,
    )
    assert.equal(
      getTableDropLinePosition(rect, { axis: "row", from: 1, target: 0 }),
      50,
    )
  })
}
