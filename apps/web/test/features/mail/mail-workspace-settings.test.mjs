import { readMailFeatureSource } from "./mail-feature-source.mjs";

export function register({ assert, readSource, test }) {
  test("Workspace settings owns mail connect, reconnect, and confirmed disconnect", async () => {
    const source = (
      await Promise.all(
        [
          "screens/workspace-settings.tsx",
          "settings/workspace-mail-connection.tsx",
          "settings/workspace-mail-connection-state.ts",
        ].map((path) => readSource(`/src/features/workspaces/${path}`)),
      )
    ).join("\n");

    assert.match(source, /Your mail connection/);
    assert.match(source, /Reconnect/);
    assert.match(source, /Disconnect Gmail\?/);
    assert.match(source, /same Gmail\s+account stays connected in any other/);
  });

  test("Mail uses the active workspace API and replaces toolbar disconnect with view settings", async () => {
    const page = await readMailFeatureSource(readSource);
    const controller = await readSource("/src/features/mail/sync/mail-sync-controller.ts");
    const menu = await readSource("/src/features/mail/organization/mail-view-settings-menu.tsx");

    assert.match(page, /useActiveWorkspaceId\(\)/);
    assert.match(page, /<MailViewSettingsMenu/);
    assert.doesNotMatch(page, /Disconnecting…|void disconnect\(\)/);
    assert.match(controller, /mailApiBasePath\(input\.connection\.workspaceId\)/);
    assert.match(menu, /DropDrawer/);
    assert.match(menu, /Group/);
    assert.match(menu, /Filter/);
    assert.match(menu, /Properties/);
    assert.match(menu, /Database/);
    assert.match(menu, /Customize hover actions/);
  });
}
