export function register({ assert, loadModule, test }) {
  test("table row measurement preserves relative centers, heights and terminal drop position", async () => {
    const { measureTableRowLayout, areRowLayoutsEqual } = await loadModule(
      "/src/features/databases/views/table/model/table-row-layout.ts",
    );
    const layout = { getBoundingClientRect: () => ({ top: 50 }), querySelector: () => null };
    const row = (id, top, height) => ({
      dataset: { databaseRowId: id },
      getBoundingClientRect: () => ({ top, height }),
    });
    const measured = measureTableRowLayout(layout, [row("a", 60, 20), row("b", 80, 40)]);
    assert.deepEqual(measured, {
      centers: { a: 20, b: 50 },
      heights: { a: 20, b: 40 },
      dropTops: [10, 30, 70],
      rowIds: ["a", "b"],
    });
    assert.equal(areRowLayoutsEqual(measured, structuredClone(measured)), true);
    assert.equal(areRowLayoutsEqual(measured, { ...measured, heights: { a: 21, b: 40 } }), false);
    assert.equal(areRowLayoutsEqual(measured, { ...measured, rowIds: ["b", "a"] }), false);
    assert.deepEqual(
      measureTableRowLayout(
        { ...layout, querySelector: () => ({ getBoundingClientRect: () => ({ top: 85 }) }) },
        [],
      ),
      { centers: {}, heights: {}, dropTops: [35], rowIds: [] },
    );
    assert.deepEqual(measureTableRowLayout(layout, []), {
      centers: {},
      heights: {},
      dropTops: [],
      rowIds: [],
    });
  });

  test("column keys preserve pending insertion side and structural editing gate", async () => {
    const { getTableColumnKeys } = await loadModule(
      "/src/features/databases/views/table/model/database-table-model.ts",
    );
    assert.deepEqual(
      getTableColumnKeys({
        columnIds: ["name", "p1"],
        canEditStructure: false,
        pendingInsert: null,
      }),
      ["name", "p1"],
    );
    const left = getTableColumnKeys({
      columnIds: ["name", "p1"],
      canEditStructure: false,
      pendingInsert: { sourceColumnKey: "p1", side: "left", position: 1 },
    });
    const right = getTableColumnKeys({
      columnIds: ["name", "p1"],
      canEditStructure: false,
      pendingInsert: { sourceColumnKey: "p1", side: "right", position: 2 },
    });
    assert.equal(left[2], "p1");
    assert.equal(right[1], "p1");
    assert.equal(left.length, 3);
    assert.equal(right.length, 3);
    assert.equal(
      getTableColumnKeys({ columnIds: ["name"], canEditStructure: true, pendingInsert: null })
        .length,
      2,
    );
  });

  test("nested table visibility memoizes ancestor walks and preserves row order", async () => {
    const { getVisibleNestedTableRows } = await loadModule(
      "/src/features/databases/views/table/model/database-table-model.ts",
    );
    const rows = Array.from({ length: 10000 }, (_, index) => ({ id: `row-${index}` }));
    const parents = Object.fromEntries(
      rows.slice(1).map((row, index) => [row.id, [`row-${index}`]]),
    );
    const visible = getVisibleNestedTableRows({
      collapsedRowIds: new Set(["row-5000"]),
      nested: true,
      parentRowIdsByRowId: parents,
      rows,
    });

    assert.deepEqual(
      visible.map((row) => row.id),
      rows.slice(0, 5001).map((row) => row.id),
    );
    assert.equal(
      getVisibleNestedTableRows({
        collapsedRowIds: new Set(),
        nested: true,
        parentRowIdsByRowId: parents,
        rows,
      }),
      rows,
    );
    assert.equal(
      getVisibleNestedTableRows({
        collapsedRowIds: new Set(["row-0"]),
        nested: false,
        parentRowIdsByRowId: parents,
        rows,
      }),
      rows,
    );
  });
}
