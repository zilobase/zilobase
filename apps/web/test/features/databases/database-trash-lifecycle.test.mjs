export function register({ assert, readSource, readWorkspace, test }) {
  test("deleted databases remain visible as read-only restorable blocks", async () => {
    const [block, controller, screen, view, cache] = await Promise.all([
      readSource("/src/features/databases/core/database-block.tsx"),
      readSource(
        "/src/features/databases/views/controller/use-database-view-controller.tsx",
      ),
      readSource("/src/features/databases/core/database-screen.tsx"),
      readSource("/src/features/databases/views/components/database-view.tsx"),
      readWorkspace("/packages/features/src/shared/item-action-cache.ts"),
    ])

    assert.match(block, /includeDeleted=\{isEditable\}/)
    assert.match(block, /showTrashedBanner/)
    assert.match(controller, /Boolean\(bootstrap\?\.database\.deletedAt\)/)
    assert.match(
      controller,
      /requestedEditable\s*&&\s*!databaseDeleted\s*&&\s*!isDatabaseLocked/,
    )
    assert.match(view, /databaseDeleted[\s\S]*?<DatabaseTrashBanner/)
    assert.match(screen, /Boolean\(payload\?\.database\.deletedAt\)/)
    assert.doesNotMatch(screen, /\{databasePage\?\.deletedAt \? \(/)
    assert.match(cache, /query\.queryKey\[query\.queryKey\.length - 1\] === true/)
  })
}
