export function register({ assert, loadModule, test }) {
  const model = () =>
    loadModule("/src/features/databases/views/kanban/model/database-kanban-moves.ts");
  const property = (type = "status") => ({ id: "status", property: { id: "status", type } });
  const rows = ["a", "b", "c"].map((id) => ({ id, pageId: id, page: { name: id } }));
  const ids = (rows) => rows.map(({ id }) => id);
  const draft = (move, id = 1, committedVersion = null) => ({
    id,
    move,
    row: rows.find(({ id }) => id === move.rowId),
    committedVersion,
  });

  test("kanban dropped positions match every same-column preview with variable-height cards", async () => {
    const { getKanbanMove, projectKanbanMoves } = await model();
    const { getKanbanCardPreview } = await loadModule(
      "/src/features/databases/views/kanban/model/database-kanban-card-drag.ts",
    );
    const heights = [40, 80, 60];
    for (const sourceIndex of [0, 1, 2]) {
      for (const targetIndex of [0, 1, 2, 3]) {
        const move = getKanbanMove({
          rows,
          targetRows: rows,
          rowId: rows[sourceIndex].id,
          targetIndex,
          sourceGroupValue: "Todo",
          targetGroupValue: "Todo",
          property: property(),
          propertyValuesByKey: {},
        });
        const final = projectKanbanMoves(rows, {}, move ? [draft(move)] : []).rows;
        const preview = getKanbanCardPreview({
          heights,
          gap: 8,
          draggedHeight: heights[sourceIndex],
          sourceIndex,
          targetIndex,
        });
        const tops = new Map();
        let top = 0;
        final.forEach((row) => {
          tops.set(row.id, top);
          top += heights[rows.indexOf(row)] + 8;
        });
        let originalTop = 0;
        rows.forEach((row, index) => {
          assert.equal(
            tops.get(row.id),
            index === sourceIndex ? preview.placeholderTop : originalTop + preview.offsets[index],
          );
          originalTop += heights[index] + 8;
        });
      }
    }
  });

  test("kanban retains both position and group through stale refreshes until its committed version", async () => {
    const { getKanbanMove, projectKanbanMoves, getPendingKanbanMoves } = await model();
    const values = { "a:status": "Todo", "b:status": "Done", "c:status": "Done" };
    const move = getKanbanMove({
      rows,
      targetRows: rows.slice(1),
      rowId: "a",
      targetIndex: 1,
      sourceGroupValue: "Todo",
      targetGroupValue: "Done",
      property: property(),
      propertyValuesByKey: values,
    });
    for (const version of [null, 1, 8]) {
      const pending = getPendingKanbanMoves([draft(move, 1, 9)], version);
      const projected = projectKanbanMoves(rows, values, pending);
      assert.deepEqual(ids(projected.rows), ["b", "a", "c"]);
      assert.equal(projected.propertyValuesByKey["a:status"], "Done");
    }
    assert.equal(getPendingKanbanMoves([draft(move, 1, 9)], 9).length, 0);
    assert.equal(
      getPendingKanbanMoves([draft(move)], 100).length,
      1,
      "a refresh cannot retire an unconfirmed move",
    );
  });

  test("kanban rapid moves use the displayed order and an older confirmation preserves the latest drop", async () => {
    const { getKanbanMove, projectKanbanMoves, getPendingKanbanMoves } = await model();
    const move = (current, rowId, targetIndex) =>
      getKanbanMove({
        rows: current,
        targetRows: current,
        rowId,
        targetIndex,
        sourceGroupValue: "Todo",
        targetGroupValue: "Todo",
        property: property(),
        propertyValuesByKey: {},
      });
    const first = move(rows, "a", 3);
    const shown = projectKanbanMoves(rows, {}, [draft(first)]).rows;
    assert.deepEqual(ids(shown), ["b", "c", "a"]);
    const second = move(shown, "a", 1);
    assert.equal(second.beforeRowId, "c");
    const pending = getPendingKanbanMoves([draft(first, 1, 2), draft(second, 2)], 2);
    assert.deepEqual(ids(projectKanbanMoves(shown, {}, pending).rows), ["b", "a", "c"]);
    assert.deepEqual(
      ids(projectKanbanMoves(rows, {}, [draft(second, 2)]).rows),
      ["b", "a", "c"],
      "a failed first move cannot discard a newer intention",
    );
  });

  test("kanban drafts preserve unrelated edits, newly loaded rows and missing anchors", async () => {
    const { projectKanbanMoves } = await model();
    const move = { rowId: "a", pageId: "a", afterRowId: "b", beforeRowId: "c" };
    const renamedB = { ...rows[1], page: { name: "Updated elsewhere" } };
    const extra = { id: "d", pageId: "d", page: { name: "New row" } };
    const result = projectKanbanMoves([rows[0], renamedB, rows[2], extra], { other: "value" }, [
      draft(move),
    ]);
    assert.deepEqual(ids(result.rows), ["b", "a", "c", "d"]);
    assert.equal(result.rows[0], renamedB);
    assert.equal(result.propertyValuesByKey.other, "value");
    assert.deepEqual(ids(projectKanbanMoves([rows[0], renamedB], {}, [draft(move)]).rows), [
      "b",
      "a",
    ]);
  });

  test("a rapid same-column reorder retains its preceding pending destination after failure", async () => {
    const { inheritKanbanMoveGroup, projectKanbanMoves } = await model();
    const first = {
      rowId: "a",
      pageId: "a",
      afterRowId: "b",
      beforeRowId: "c",
      group: { propertyId: "status", value: "Done", serializedValue: "Done" },
    };
    const second = inheritKanbanMoveGroup(
      { rowId: "a", pageId: "a", afterRowId: "c", beforeRowId: null },
      [draft(first)],
    );
    const result = projectKanbanMoves(rows, { "a:status": "Todo" }, [draft(second, 2)]);
    assert.deepEqual(ids(result.rows), ["b", "c", "a"]);
    assert.equal(result.propertyValuesByKey["a:status"], "Done");
    assert.equal(second.group.serializedValue, "Done");
  });

  test("kanban multi-select drop into an existing membership does not duplicate or overshoot", async () => {
    const { getKanbanMove, projectKanbanMoves } = await model();
    const values = { "a:status": ["Todo", "Done"], "b:status": ["Done"], "c:status": ["Done"] };
    const move = getKanbanMove({
      rows,
      targetRows: rows,
      rowId: "a",
      targetIndex: 2,
      sourceGroupValue: "Todo",
      targetGroupValue: "Done",
      property: property("multi_select"),
      propertyValuesByKey: values,
    });
    const projected = projectKanbanMoves(rows, values, [draft(move)]);
    assert.deepEqual(ids(projected.rows), ["b", "a", "c"]);
    assert.deepEqual(projected.propertyValuesByKey["a:status"], ["Done"]);
  });

  test("kanban empty columns and title groups use the same move projection", async () => {
    const { getKanbanMove, projectKanbanMoves } = await model();
    const move = getKanbanMove({
      rows,
      targetRows: [],
      rowId: "c",
      targetIndex: 0,
      sourceGroupValue: "c",
      targetGroupValue: "New title",
      property: { id: "name", property: { id: "name", type: "text" } },
      propertyValuesByKey: {},
    });
    const projected = projectKanbanMoves(rows, {}, [draft(move)]);
    assert.deepEqual(ids(projected.rows), ["c", "a", "b"]);
    assert.equal(projected.rows[0].page.name, "New title");
    assert.equal(rows[2].page.name, "c", "server rows remain untouched");
  });
}
