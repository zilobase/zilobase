export function register({ assert, loadModule, test }) {
  const model = () =>
    loadModule("/src/features/databases/views/kanban/model/database-kanban-card-drag.ts");
  test("kanban drop preserves the preview positions during a same-column reorder", async () => {
    const { getKanbanDroppedRows, getKanbanCardPreview } = await model();
    const rows = [
      { id: "a", height: 40 },
      { id: "b", height: 80 },
      { id: "c", height: 60 },
    ];
    for (const sourceIndex of [0, 1, 2]) {
      for (const targetIndex of [0, 1, 2, 3]) {
        const rowIds = rows.map((row) => row.id);
        rowIds.splice(sourceIndex, 1);
        rowIds.splice(
          targetIndex > sourceIndex ? targetIndex - 1 : targetIndex,
          0,
          rows[sourceIndex].id,
        );
        const preview = getKanbanCardPreview({
          heights: rows.map((row) => row.height),
          gap: 8,
          draggedHeight: rows[sourceIndex].height,
          sourceIndex,
          targetIndex,
        });
        const dropped = getKanbanDroppedRows({
          rows,
          rowIds,
          draggedRow: rows[sourceIndex],
          isTarget: true,
        });
        const finalTops = new Map();
        let top = 0;
        for (const row of dropped) {
          finalTops.set(row.id, top);
          top += row.height + 8;
        }
        let originalTop = 0;
        rows.forEach((row, index) => {
          assert.equal(
            finalTops.get(row.id),
            index === sourceIndex ? preview.placeholderTop : originalTop + preview.offsets[index],
          );
          originalTop += row.height + 8;
        });
      }
    }
  });
  test("kanban dropped layout stays identical before and after cache group updates", async () => {
    const { getKanbanDroppedRows: dropped } = await model();
    const a = { id: "a" },
      b = { id: "b" },
      c = { id: "c" };
    const move = { draggedRow: a, rowIds: ["b", "a", "c"] };
    assert.deepEqual(dropped({ ...move, rows: [a, b], isTarget: false }), [b]);
    assert.deepEqual(dropped({ ...move, rows: [b], isTarget: false }), [b]);
    assert.deepEqual(dropped({ ...move, rows: [c], isTarget: true }), [a, c]);
    assert.deepEqual(dropped({ ...move, rows: [a, c], isTarget: true }), [a, c]);
    assert.deepEqual(dropped({ ...move, rows: [], isTarget: true }), [a]);
  });
}
