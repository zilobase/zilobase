export function register({ assert, loadModule, test }) {
  const model = () =>
    loadModule("/src/features/databases/views/kanban/model/database-kanban-card-drag.ts");
  const board = { left: 300, right: 1100, scrollLeft: 200, maxScrollLeft: 700 };
  test("kanban edge scrolling accelerates in both directions and stays idle in the middle", async () => {
    const { getKanbanEdgeScrollSpeed: speed } = await model();
    assert.equal(speed({ ...board, clientX: 700 }), 0);
    assert.equal(speed({ ...board, clientX: 300 }), -1000);
    assert.equal(speed({ ...board, clientX: 1100 }), 1000);
    assert.equal(speed({ ...board, clientX: 390 }), -500);
    assert.equal(speed({ ...board, clientX: 1010 }), 500);
    // Start scrolling while the pointer is still well inside the viewport.
    assert.ok(speed({ ...board, clientX: 420 }) < 0);
    assert.ok(speed({ ...board, clientX: 980 }) > 0);
    assert.equal(speed({ ...board, clientX: 480 }), 0);
    assert.equal(speed({ ...board, clientX: 920 }), 0);
    assert.equal(speed({ ...board, clientX: 299 }), 0);
    assert.equal(speed({ ...board, clientX: 1101 }), 0);
  });
  test("kanban edge scrolling respects limits and narrow viewports", async () => {
    const { getKanbanEdgeScrollSpeed: speed } = await model();
    assert.equal(speed({ ...board, clientX: 300, scrollLeft: 0 }), 0);
    assert.equal(speed({ ...board, clientX: 1100, scrollLeft: 700 }), 0);
    assert.equal(speed({ ...board, clientX: 1100, maxScrollLeft: 0 }), 0);
    assert.equal(speed({ ...board, clientX: 350, right: 400 }), 0);
    assert.ok(speed({ ...board, clientX: 395, right: 400 }) > 0);
    assert.equal(speed({ ...board, clientX: 300, right: 300 }), 0);
  });
}
