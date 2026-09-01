export function register({ assert, readSource, test }) {
  test("Workspace settings owns mail connect, reconnect, and confirmed disconnect", async () => {
    const source = await readSource(
      "/src/features/workspaces/pages/workspace-settings.tsx",
    )

    assert.match(source, /Your mail connection/)
    assert.match(source, /Reconnect/)
    assert.match(source, /Disconnect Gmail\?/)
    assert.match(source, /same Gmail account stays connected in any other/)
    assert.match(source, /destroyMailDatabase\(mailDatabaseName/)
  })

  test("Mail uses the active workspace API and replaces toolbar disconnect with view settings", async () => {
    const page = await readSource("/src/features/mail/pages/mail.tsx")
    const controller = await readSource(
      "/src/features/mail/model/mail-sync-controller.ts",
    )
    const menu = await readSource(
      "/src/features/mail/components/mail-view-settings-menu.tsx",
    )

    assert.match(page, /useActiveWorkspaceId\(\)/)
    assert.match(page, /<MailViewSettingsMenu \/>/)
    assert.doesNotMatch(page, /Disconnecting…|void disconnect\(\)/)
    assert.match(controller, /mailApiBasePath\(input\.connection\.workspaceId\)/)
    assert.match(menu, /DropDrawer/)
    assert.match(menu, /Group/)
    assert.match(menu, /Filter/)
    assert.match(menu, /Properties/)
    assert.match(menu, /Database/)
    assert.match(menu, /Customize hover actions/)
  })
}
