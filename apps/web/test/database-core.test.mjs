export function register({ assert, loadModule, test }) {
  test("database block helpers preserve normal and setup attributes", async () => {
    const utils = await loadModule(
      "/src/editor/extensions/database/core/utils.ts"
    )

    assert.deepEqual(utils.createDatabaseBlockAttrs("database-1"), {
      databaseId: "database-1",
      setupMode: false,
    })
    assert.deepEqual(utils.createDatabaseSetupBlockAttrs("database-1"), {
      databaseId: "database-1",
      setupMode: true,
      showTitle: true,
    })
    assert.deepEqual(utils.createDatabaseSetupBlockContent("database-1"), [
      {
        type: "databaseBlock",
        attrs: {
          databaseId: "database-1",
          setupMode: true,
          showTitle: true,
        },
      },
      { type: "paragraph" },
    ])
  })

  test("database setup prompts resolve to the existing template catalog", async () => {
    const templates = await loadModule(
      "/src/editor/extensions/database/setup/database-setup-templates.ts"
    )

    assert.equal(templates.inferDatabaseSetupTemplateId("Sprint roadmap"), "projects")
    assert.equal(templates.inferDatabaseSetupTemplateId("Customer CRM"), "crm")
    assert.equal(templates.inferDatabaseSetupTemplateId("   "), null)
    assert.equal(templates.getDatabaseSetupTemplate("projects")?.id, "projects")
  })
}
