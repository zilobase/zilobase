export function register({ assert, readSource, test }) {
  test("database automation release is server-capability gated and source scoped", async () => {
    const [manager, toolbar] = await Promise.all([
      readSource("/src/features/databases/automations/database-automation-manager.tsx"),
      readSource("/src/features/databases/views/view/database-view-toolbar.tsx"),
    ])
    assert.match(toolbar, /useDatabaseAutomationCapability/)
    assert.match(toolbar, /activeViewTab\?\.dataSourceId/)
    assert.match(toolbar, /automationsEnabled/)
    assert.match(manager, /useDatabaseAutomations\(databaseId, dataSourceId\)/)
  })

  test("automation manager includes builder, lifecycle, history, and discard flows", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )
    for (const behavior of [
      "Create and activate",
      "Discard automation changes?",
      "Add trigger",
      "Add action",
      "Recent runs",
      "Run details",
      "Duplicate automation",
      "Pause",
      "Resume",
    ]) assert.match(manager, new RegExp(behavior.replace("?", "\\?")))
    assert.match(manager, /w-\[448px\]/)
    assert.match(manager, /max-sm:h-\[calc\(100dvh-1rem\)\]/)
  })

  test("data-source settings launches the shared automation manager", async () => {
    const settings = await readSource(
      "/src/features/databases/views/view-settings/view/data-source-settings.tsx",
    )
    assert.match(settings, /onOpenAutomations/)
    assert.doesNotMatch(settings, /Automation settings/)
  })
}
