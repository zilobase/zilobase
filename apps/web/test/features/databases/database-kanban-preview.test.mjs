export function register({ assert, loadModule, test }) {
  const model = () =>
    loadModule("/src/features/databases/views/kanban/model/database-kanban-card-drag.ts");
  test("kanban preview reorders variable-height cards without changing drop indices", async () => {
    const { getKanbanCardPreview: preview } = await model();
    const input = { heights: [40, 80, 60], gap: 8, draggedHeight: 40, sourceIndex: 0 };
    const down = preview({ ...input, targetIndex: 3 });
    assert.equal(down.placeholderTop, 156);
    assert.deepEqual(down.offsets.slice(1), [-48, -48]);
    assert.equal(down.heightDelta, 0);
    const up = preview({ ...input, draggedHeight: 60, sourceIndex: 2, targetIndex: 0 });
    assert.equal(up.placeholderTop, 0);
    assert.deepEqual(up.offsets.slice(0, 2), [68, 68]);
    assert.equal(up.heightDelta, 0);
    for (const targetIndex of [0, 1]) {
      const unchanged = preview({ ...input, targetIndex });
      assert.equal(unchanged.placeholderTop, 0);
      assert.deepEqual(unchanged.offsets.slice(1), [0, 0]);
    }
  });
  test("kanban preview closes source gaps and opens empty destination columns", async () => {
    const { getKanbanCardPreview: preview } = await model();
    const source = preview({
      heights: [40, 80],
      gap: 8,
      draggedHeight: 40,
      sourceIndex: 0,
      targetIndex: null,
    });
    assert.equal(source.placeholderTop, null);
    assert.equal(source.offsets[1], -48);
    assert.equal(source.heightDelta, -48);
    const empty = preview({
      heights: [],
      gap: 8,
      draggedHeight: 40,
      sourceIndex: -1,
      targetIndex: 0,
    });
    assert.equal(empty.placeholderTop, 0);
    assert.equal(empty.heightDelta, 48);
    const destination = preview({
      heights: [80, 60],
      gap: 8,
      draggedHeight: 40,
      sourceIndex: -1,
      targetIndex: 1,
    });
    assert.equal(destination.placeholderTop, 88);
    assert.deepEqual(destination.offsets, [0, 48]);
    assert.equal(destination.heightDelta, 48);
  });
  test("kanban preview does not duplicate cards already in the destination group", async () => {
    const { getKanbanCardPreview: preview } = await model();
    const result = preview({
      heights: [40, 80],
      gap: 8,
      draggedHeight: 40,
      sourceIndex: 0,
      targetIndex: 2,
    });
    assert.equal(result.placeholderTop, 88);
    assert.equal(result.heightDelta, 0);
    assert.equal(result.offsets[1], -48);
  });
}
