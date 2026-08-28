import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("sidebar footer exposes pinned customization and creation actions", async () => {
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
    assert.match(sidebarSource, /<span>Customize sidebar<\/span>/)
    assert.match(
      sidebarSource,
      /onClick=\{\(\) => setCustomizeSidebarOpen\(true\)\}/,
    )
    assert.match(sidebarSource, /onSelect=\{\(\) => onCreatePage\(\)\}/)
    assert.match(sidebarSource, /onSelect=\{\(\) => onCreateDatabase\(\)\}/)
    assert.match(sidebarSource, /onSelect=\{\(\) => onCreateChat\(\)\}/)
    assert.doesNotMatch(sidebarSource, /onSelect=\{onCreate(?:Page|Database|Chat)\}/)
    assert.match(sidebarSource, /gap-3! px-4 pt-2 pb-3/)
    assert.ok(
      sidebarSource.indexOf("<span>Customize sidebar</span>") <
        sidebarSource.indexOf("Open in desktop app"),
      "Customize sidebar must stay above the desktop-app card",
    )
    assert.match(
      sidebarSource,
      /useWorkspaceMeetings\(\s*isMeetingsPage \? workspaceId : null/,
    )
    assert.match(
      sidebarSource,
      /usePageNavigation\(\s*isAiPage \|\| isMeetingsPage \? null : workspaceId/,
    )
    assert.doesNotMatch(sidebarSource, /useCreateAiChatThread/)
    assert.match(sidebarSource, /setActiveThreadId\(null\)/)
    assert.doesNotMatch(sidebarSource, /ThemeDropdown/)
    assert.match(sidebarSource, /<AppSidebarHeader[\s\S]*navigation=\{[\s\S]*<NavMain/)
    assert.match(workspaceSource, /<span>Settings<\/span>/)
    assert.match(workspaceSource, /Add workspace[\s\S]*WorkspaceSettingsItem/)
  })
}
