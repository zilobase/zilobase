import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("sidebar footer exposes creation actions without theme or settings", async () => {
    const sidebarSource = await readFile(
      new URL("../src/components/app-sidebar.tsx", import.meta.url),
      "utf8",
    )
    const workspaceSource = await readFile(
      new URL("../src/components/workspace-switcher.tsx", import.meta.url),
      "utf8",
    )

    assert.match(sidebarSource, /<span>New<\/span>/)
    assert.match(sidebarSource, /<span>Page<\/span>/)
    assert.match(sidebarSource, /<span>Database<\/span>/)
    assert.match(sidebarSource, /<span>New chat<\/span>/)
    assert.doesNotMatch(sidebarSource, /ThemeDropdown/)
    assert.match(sidebarSource, /<AppSidebarHeader[\s\S]*navigation=\{[\s\S]*<NavMain/)
    assert.match(workspaceSource, /<span>Settings<\/span>/)
    assert.match(workspaceSource, /Add workspace[\s\S]*WorkspaceSettingsItem/)
  })
}
