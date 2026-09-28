export function register({ assert, readSource, test }) {
  test("kanban drag uses registered resize-observed geometry", async () => {
    const controller = await readSource(
      "/src/features/databases/views/kanban/controller/use-database-kanban-card-drag.ts",
    );
    const view = await readSource(
      "/src/features/databases/views/kanban/components/database-kanban-column.tsx",
    );
    const geometry = await readSource(
      "/src/features/databases/views/kanban/controller/use-kanban-geometry.ts",
    );

    assert.doesNotMatch(controller, /querySelectorAll/);
    assert.doesNotMatch(controller, /closest\("\.database-kanban-board"\)/);
    assert.match(geometry, /new ResizeObserver/);
    assert.match(controller, /pendingHitTest\.current/);
    assert.match(controller, /hitTestFrame\.current = requestAnimationFrame/);
    assert.match(view, /ref=\{cardDrag\.getColumnRef\(option\.id\)\}/);
    assert.match(view, /ref=\{cardDrag\.getCardRef\(option\.id, item\.id\)\}/);
  });

  test("kanban drag controller delegates persistence and geometry to their owners", async () => {
    const controller = await readSource(
      "/src/features/databases/views/kanban/controller/use-database-kanban-card-drag.ts",
    );
    assert.match(controller, /input\.submitMove\(move, clearSortViewId\)/);
    assert.match(controller, /useKanbanGeometry\(input\)/);
    assert.doesNotMatch(controller, /useMoveDatabaseRow|setDroppedRows|onOptimisticAccepted/);
  });
}
