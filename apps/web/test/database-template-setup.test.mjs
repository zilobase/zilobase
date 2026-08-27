import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("database setup applies templates to the active data source", async () => {
    const source = await readFile(
      new URL(
        "../src/editor/extensions/database/setup/database-setup-card.tsx",
        import.meta.url
      ),
      "utf8"
    )

    assert.match(
      source,
      /await applyTemplate\.mutateAsync\(\{[\s\S]*?config: nextDatabasePatch\.config,\s*databaseId: activeDataSource\.id,/
    )
  })

  test("applying a database template refreshes sidebar navigation", async () => {
    const source = await readFile(
      new URL(
        "../../../packages/features/src/databases/hooks.ts",
        import.meta.url
      ),
      "utf8"
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
