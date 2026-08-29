export function register({ readSource, assert, test }) {
  test("desktop workspace switcher groups current and other servers", async () => {
    const source = await readSource("/src/features/sidebar/workspace-switcher.tsx")
    assert.match(source, /isTauri\(\)/)
    assert.match(source, /Connect another server/)
    assert.match(source, /OtherServerSection/)
    assert.match(source, /listDesktopServerProfiles/)
    assert.match(source, /executeDesktopServerSwitch/)
    assert.match(source, /isWorkspacePinned && !isDesktop/)
  })

  test("other-server rows are desktop-gated and web still has workspaces", async () => {
    const source = await readSource("/src/features/sidebar/workspace-switcher.tsx")
    assert.match(source, /Workspaces/)
    assert.match(source, /Add workspace/)
    assert.match(source, /isDesktop[\s\S]*otherProfiles\.map/)
  })
}
