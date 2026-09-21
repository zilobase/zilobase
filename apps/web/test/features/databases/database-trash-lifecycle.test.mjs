export function register({ assert, readSource, readWorkspace, test }) {
  test("deleted embedded databases are hidden while full-page trash remains restorable", async () => {
    const [block, controller, screen, view, toolbarActions, restoreButton, styles, cache] = await Promise.all([
      readSource("/src/features/databases/core/database-block.tsx"),
      readSource(
        "/src/features/databases/views/controller/use-database-view-controller.tsx",
      ),
      readSource("/src/features/databases/core/database-screen.tsx"),
      readSource("/src/features/databases/views/components/database-view.tsx"),
      readSource("/src/features/databases/views/components/database-toolbar-actions.tsx"),
      readSource("/src/features/databases/core/database-trash-restore-button.tsx"),
      readSource("/src/features/databases/styles/database.css"),
      readWorkspace("/packages/features/src/shared/item-action-cache.ts"),
    ])

    assert.match(block, /useDatabaseMetadata\(databaseId, \{ includeDeleted: true \}\)/)
    assert.match(block, /databaseLifecycle\?\.database\.deletedAt/)
    assert.match(block, /data-database-deleted="true"/)
    assert.match(styles, /node-databaseBlock:has\(> \[data-database-deleted="true"\]\)/)
    assert.doesNotMatch(block, /canRestoreDeleted=/)
    assert.doesNotMatch(block, /includeDeleted=\{isEditable\}/)
    assert.match(controller, /Boolean\(bootstrap\?\.database\.deletedAt\)/)
    assert.match(
      controller,
      /requestedEditable\s*&&\s*!databaseDeleted\s*&&\s*!isDatabaseLocked/,
    )
    assert.match(
      view,
      /!databaseDeleted \? \([\s\S]*?className="database-scroll-section"/,
    )
    assert.match(view, /deletedDatabaseId=\{databaseDeleted \? databaseId : null\}/)
    assert.match(toolbarActions, /<DatabaseTrashRestoreButton/)
    assert.match(toolbarActions, /editable \? \([\s\S]*?\) : canRestoreDeleted/)
    assert.match(restoreButton, /className="database-new-button"/)
    assert.doesNotMatch(restoreButton, /TrashedItemBanner/)
    assert.match(screen, /Boolean\(payload\?\.database\.deletedAt\)/)
    assert.match(screen, /canRestoreDeleted=\{!readOnly\}/)
    assert.doesNotMatch(screen, /\{databasePage\?\.deletedAt \? \(/)
    assert.doesNotMatch(screen, /<DatabaseTrashBanner/)
    assert.match(cache, /query\.queryKey\[query\.queryKey\.length - 1\] === true/)
  })
}
