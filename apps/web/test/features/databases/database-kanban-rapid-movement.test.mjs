export function register({ assert, loadModule, readSource, test }) {
  test("kanban movement preserves hidden and unloaded row anchors", async () => {
    const { getAnchoredReorderedRowIds, getFilteredReorderedRowIds } = await loadModule(
      "/src/features/databases/interactions/database-row-drag.ts",
    );
    const allRows = ["hidden-a", "visible-a", "hidden-b", "visible-b", "unloaded-boundary"].map(
      (id) => ({ id }),
    );
    const visibleRows = [allRows[1], allRows[3]];

    assert.deepEqual(getFilteredReorderedRowIds(allRows, visibleRows, "visible-b", 0), [
      "hidden-a",
      "visible-b",
      "visible-a",
      "hidden-b",
      "unloaded-boundary",
    ]);
    assert.deepEqual(getAnchoredReorderedRowIds(allRows, "visible-a", [allRows[3]], 1), [
      "hidden-a",
      "hidden-b",
      "visible-b",
      "visible-a",
      "unloaded-boundary",
    ]);
  });

  test("kanban group moves and auto-scroll remain independent", async () => {
    const { getDatabaseGroupMoveValue } = await loadModule(
      "/src/features/databases/interactions/database-group-values.ts",
    );
    const { getKanbanEdgeScrollSpeed } = await loadModule(
      "/src/features/databases/views/kanban/model/database-kanban-card-drag.ts",
    );

    assert.deepEqual(
      getDatabaseGroupMoveValue({
        currentValue: ["Todo", "Review"],
        propertyType: "multi_select",
        sourceGroupValue: "Todo",
        targetGroupValue: "Done",
      }),
      ["Done", "Review"],
    );
    assert.ok(
      getKanbanEdgeScrollSpeed({
        clientX: 495,
        left: 0,
        maxScrollLeft: 600,
        right: 500,
        scrollLeft: 100,
      }) > 0,
    );
  });

  test("sorted confirmation and geometry invalidation stay wired to optimistic moves", async () => {
    const controller = await readSource(
      "/src/features/databases/views/kanban/controller/use-database-kanban-card-drag.ts",
    );

    const geometry = await readSource(
      "/src/features/databases/views/kanban/controller/use-kanban-geometry.ts",
    );
    assert.match(controller, /manualPlacement\.request/);
    assert.match(
      await readSource("/src/features/databases/views/state/manual-record-placement.tsx"),
      /await pending\.run\(viewId\)/,
    );
    assert.match(geometry, /new ResizeObserver/);
    assert.match(geometry, /input\.getOptionItems/);
  });
}
