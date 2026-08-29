export function register({ assert, readSource, readWorkspace, test }) {
  test("database setup applies templates to the active data source", async () => {
    const source = await readSource("/src/editor/extensions/database/setup/database-setup-card.tsx")

    assert.match(
      source,
      /await applyTemplate\.mutateAsync\(\{[\s\S]*?config: nextDatabasePatch\.config,\s*databaseId: activeDataSource\.id,/
    )
  })

  test("applying a database template refreshes sidebar navigation", async () => {
    const source = await readWorkspace(
      "/packages/features/src/databases/mutation-hooks.ts",
    )
    const hookSource = source.slice(
      source.indexOf("export function useApplyDatabaseTemplate()"),
      source.indexOf("export function useUpdateDatabaseProperty()")
    )

    assert.match(
      hookSource,
      /queryKey: pagesNavRootQueryKey\(nextPayload\.database\.workspaceId\)/
    )
    assert.doesNotMatch(hookSource, /nextPayload\.database\.isFavorite/)
  })
}
