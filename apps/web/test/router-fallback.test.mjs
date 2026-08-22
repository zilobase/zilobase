import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("route authentication never leaves a blank screen", async () => {
    const source = await readFile(
      new URL("../src/router.tsx", import.meta.url),
      "utf8",
    )
    const errorSource = await readFile(
      new URL("../src/lib/route-error.ts", import.meta.url),
      "utf8",
    )

    assert.match(source, /defaultPendingComponent: RoutePendingPage/)
    assert.match(source, /defaultErrorComponent: RouteErrorPage/)
    assert.match(source, /Connecting to Zilobase\.\.\./)
    assert.match(errorSource, /Your desktop session is still saved/)
    assert.match(errorSource, /Something went wrong/)
    assert.match(source, /decidePublishedShareAccess/)
    assert.match(source, /describeRouteError/)
    assert.match(source, /publishedShare/)
    assert.match(source, /window\.location\.reload\(\)/)
    assert.match(source, /path: "\/connect"/)
    assert.match(source, /Change server/)
    assert.match(source, /window\.location\.assign\("\/connect"\)/)
    assert.match(source, /getConnectivityState\(\) !== "online"/)
    assert.match(source, /waitForSettledConnectivity/)
    assert.match(source, /resolveOfflineFallback/)
    assert.match(source, /decision\.type === "unavailable"/)
    assert.match(source, /getFreshSession\(\{ optional: true \}\)/)
    assert.match(source, /path: "\/recents"/)
    assert.doesNotMatch(source, /\/dashboard/)
  })

  test("published routes keep the authenticated shell after route authorization", async () => {
    const routerSource = await readFile(
      new URL("../src/router.tsx", import.meta.url),
      "utf8",
    )
    const pageSource = await readFile(
      new URL("../src/pages/page.tsx", import.meta.url),
      "utf8",
    )
    const databaseSource = await readFile(
      new URL("../src/pages/database.tsx", import.meta.url),
      "utf8",
    )

    for (const source of [pageSource, databaseSource]) {
      assert.match(source, /if \(publishedShare === "public"\)/)
      assert.doesNotMatch(source, /!session\?\.user \|\| publishedShare/)
      assert.match(source, /<AuthenticatedRouteError resource=/)
    }

    assert.doesNotMatch(pageSource, /fallback=\{<PublicPage \/>\}/)
    assert.doesNotMatch(databaseSource, /fallback=\{publicPage\}/)
    assert.match(routerSource, /component: RootRouteShell/)
    assert.match(routerSource, /<AppLayout>\s*<Outlet \/>\s*<\/AppLayout>/)
    assert.doesNotMatch(routerSource, /staleTime: 0/)
    assert.doesNotMatch(pageSource, /import \{ AppLayout \}/)
    assert.doesNotMatch(databaseSource, /import \{ AppLayout \}/)
  })
}
