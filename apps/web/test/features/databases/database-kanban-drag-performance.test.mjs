export function register({ assert, readSource, readWorkspace, test }) {
  test("kanban drag uses registered resize-observed geometry", async () => {
    const controller = await readSource(
      "/src/features/databases/views/kanban/controller/use-database-kanban-card-drag.ts",
    )
    const view = await readSource(
      "/src/features/databases/views/kanban/components/database-kanban-view.tsx",
    )

    assert.doesNotMatch(controller, /querySelectorAll/)
    assert.doesNotMatch(controller, /closest\("\.database-kanban-board"\)/)
    assert.match(controller, /new ResizeObserver/)
    assert.match(controller, /pendingHitTest\.current/)
    assert.match(controller, /hitTestFrame\.current = requestAnimationFrame/)
    assert.match(view, /ref=\{cardDrag\.getColumnRef\(option\.id\)\}/)
    assert.match(view, /ref=\{cardDrag\.getCardRef\(option\.id, item\.id\)\}/)
  })

  test("kanban provisional rows clear on optimistic acceptance", async () => {
    const controller = await readSource(
      "/src/features/databases/views/kanban/controller/use-database-kanban-card-drag.ts",
    )
    const mutations = await readWorkspace(
      "/packages/features/src/databases/mutations/rows.ts",
    )

    assert.match(controller, /applyMove\(move, \(\) => \{/)
    assert.match(controller, /markDatabaseInteractionPaint\(dropStartedAt\)/)
    assert.doesNotMatch(controller, /onSettled[^\n]*setDroppedRows/)
    assert.match(mutations, /input\.onOptimisticAccepted\?\.\(\)/)
  })
}
