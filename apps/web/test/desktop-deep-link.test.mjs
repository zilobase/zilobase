export function register({ assert, loadModule, test }) {
  test("desktop deep links preserve safe in-app routes", async () => {
    const {
      buildDesktopDeepLink,
      getDesktopDeepLinkPath,
    } = await loadModule("/src/lib/desktop-deep-link.ts")
    const path = "/p/page-1?view=board#comments"

    assert.equal(getDesktopDeepLinkPath(buildDesktopDeepLink(path)), path)
    assert.equal(getDesktopDeepLinkPath("zilobase://open?path=https://evil.test"), null)
    assert.equal(getDesktopDeepLinkPath("other://open?path=%2Fdashboard"), null)
    assert.equal(getDesktopDeepLinkPath("zilobase://auth?token=secret"), null)
  })
}
