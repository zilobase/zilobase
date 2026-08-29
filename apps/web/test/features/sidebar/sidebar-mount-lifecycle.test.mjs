export function register({ readSource, assert, test }) {
  test("page navigation keeps the application sidebar mounted", async () => {
    const source = await readSource("/src/app/shell/content/app-layout.tsx")

    const sidebarPosition = source.indexOf("<AppSidebar")
    const pageProviderPosition = source.indexOf("<PageLayoutSidebarProvider")

    assert.notEqual(sidebarPosition, -1)
    assert.notEqual(pageProviderPosition, -1)
    assert.ok(sidebarPosition < pageProviderPosition)
    assert.doesNotMatch(
      source,
      /<PageLayoutSidebarProvider[\s\S]*?<AppSidebar/,
    )
    assert.doesNotMatch(
      source,
      /<PageLayoutSidebarProvider\s+key=/,
      "route changes must not remount the app content or Ask AI sidebar",
    )
    assert.match(
      source,
      /!mainPaneNavigationActive\s*&&\s*chatSidebarOpen/,
      "promoted AI navigation must not close the mounted chat sidebar",
    )
  })
}
