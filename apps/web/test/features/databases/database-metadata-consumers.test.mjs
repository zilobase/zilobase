export function register({ assert, readSource, readWorkspace, test }) {
  test("database metadata facade uses bootstrap for authenticated and public reads", async () => {
    const hook = await readSource(
      "/src/features/databases/access/use-database-metadata.ts",
    )
    const bootstrapHook = await readWorkspace(
      "/packages/features/src/databases/queries/bootstrap.ts",
    )

    assert.match(hook, /useDatabaseBootstrap/)
    assert.doesNotMatch(hook, /\buseDatabase\(/)
    assert.match(bootstrapHook, /useDatabaseSessionId/)
    assert.match(bootstrapHook, /databaseBootstrapQueryOptions/)
    assert.match(bootstrapHook, /useQuery/)
  })

  test("metadata-only application consumers no longer request database payloads", async () => {
    const paths = [
      "/src/app/shell/document-favicon.tsx",
      "/src/app/shell/content/app-layout.tsx",
      "/src/features/sidebar/commands/use-item-sharing.ts",
      "/src/features/sidebar/commands/use-navigation-item-actions.ts",
      "/src/features/databases/setup/components/database-setup-card.tsx",
      "/src/features/databases/views/view-settings/components/data-source-settings.tsx",
      "/src/features/mail/database-sync/mail-database-sync-panel.tsx",
    ]

    for (const path of paths) {
      const source = await readSource(path)
      assert.match(source, /useDatabaseMetadata/)
      assert.doesNotMatch(source, /\buseDatabase\(/)
    }
  })

  test("sidebar and layout previews use bounded record windows", async () => {
    const sidebar = await readSource(
      "/src/features/sidebar/components/sidebar-database-view-section.tsx",
    )
    const layout = await readSource(
      "/src/features/pages/layout/layout-editor.tsx",
    )
    const pane = await readSource(
      "/src/features/pages/pane/page-pane-header.tsx",
    )

    assert.match(sidebar, /useDatabaseRecords/)
    assert.match(sidebar, /composeDatabaseControllerPayload/)
    assert.doesNotMatch(sidebar, /disabled=\{addRow\.isPending\}/)
    assert.match(layout, /useDatabaseRecords/)
    assert.match(layout, /Load more pages/)
    assert.match(pane, /function DatabaseBreadcrumb[\s\S]*useDatabaseBootstrap/)
    assert.doesNotMatch(
      pane,
      /@\/features\/databases\/hooks\/use-database-/,
    )
  })
}
