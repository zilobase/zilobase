export function register({ assert, loadModule, test }) {
  test("desktop deep links preserve safe in-app routes", async () => {
    const {
      buildDesktopAuthDeepLink,
      buildDesktopDeepLink,
      getDesktopAuthDeepLink,
      getDesktopDeepLinkPath,
    } = await loadModule("/src/lib/desktop-deep-link.ts")
    const path = "/p/page-1?view=board#comments"

    assert.equal(getDesktopDeepLinkPath(buildDesktopDeepLink(path)), path)
    assert.equal(getDesktopDeepLinkPath("zilobase://open?path=https://evil.test"), null)
    assert.equal(getDesktopDeepLinkPath("other://open?path=%2Fdashboard"), null)

    const authLink = getDesktopAuthDeepLink(
      buildDesktopAuthDeepLink("single-use-token", "/onboarding")
    )
    assert.deepEqual(authLink, {
      path: "/onboarding",
      token: "single-use-token",
    })
    assert.equal(getDesktopAuthDeepLink("zilobase://auth"), null)
  })
}
