export function register({ assert, loadModule, readSource, test }) {
  test("database setup template inference is deterministic and complete", async () => {
    const {
      databaseSetupMoreTemplates,
      databaseSetupSuggestedTemplates,
      getDatabaseSetupTemplate,
      inferDatabaseSetupTemplateId,
    } = await loadModule("/src/features/databases/setup/model/database-setup-templates.ts");

    const templates = [...databaseSetupSuggestedTemplates, ...databaseSetupMoreTemplates];

    assert.equal(new Set(templates.map(({ id }) => id)).size, templates.length);
    assert.ok(templates.every(({ id }) => getDatabaseSetupTemplate(id)?.id === id));
    assert.equal(inferDatabaseSetupTemplateId("Build a sales CRM"), "crm");
    assert.equal(inferDatabaseSetupTemplateId("Plan our publishing calendar"), "content-calendar");
    assert.equal(inferDatabaseSetupTemplateId("   "), null);
    assert.equal(inferDatabaseSetupTemplateId("inventory"), null);
  });

  test("database setup applies templates to the active data source", async () => {
    const source = await readSource(
      "/src/features/databases/setup/components/database-setup-card.tsx",
    );

    assert.match(
      source,
      /await applyTemplate\.mutateAsync\(\{[\s\S]*?config: nextDatabasePatch\.config,\s*databaseId: activeDataSource\.id,/,
    );
  });
}
