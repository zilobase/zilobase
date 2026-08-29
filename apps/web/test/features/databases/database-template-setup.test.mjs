export function register({ assert, loadModule, readSource, readWorkspace, test }) {
  test("database setup template inference is deterministic and complete", async () => {
    const {
      databaseSetupMoreTemplates,
      databaseSetupSuggestedTemplates,
      getDatabaseSetupTemplate,
      inferDatabaseSetupTemplateId,
    } = await loadModule(
      "/src/features/databases/setup/model/database-setup-templates.ts",
    )

    const templates = [
      ...databaseSetupSuggestedTemplates,
      ...databaseSetupMoreTemplates,
    ]

    assert.equal(new Set(templates.map(({ id }) => id)).size, templates.length)
    assert.ok(templates.every(({ id }) => getDatabaseSetupTemplate(id)?.id === id))
    assert.equal(inferDatabaseSetupTemplateId("Build a sales CRM"), "crm")
    assert.equal(inferDatabaseSetupTemplateId("Plan our publishing calendar"), "content-calendar")
    assert.equal(inferDatabaseSetupTemplateId("   "), null)
    assert.equal(inferDatabaseSetupTemplateId("inventory"), null)
  })

  test("database setup applies templates to the active data source", async () => {
    const source = await readSource("/src/features/databases/setup/view/database-setup-card.tsx")

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
