export function register({ readSource, assert, test }) {
  test("route authentication never leaves a blank screen", async () => {
    const source = (
      await Promise.all([
        "router",
        "pending-pages",
        "route-error-page",
        "guards",
        "route-roots",
        "route-groups/app-routes",
        "route-groups/public-routes",
        "route-groups/content-routes",
      ].map((path) => readSource(`/src/app/routing/${path}.tsx`).catch(() =>
        readSource(`/src/app/routing/${path}.ts`),
      )))
    ).join("\n")
    const errorSource = await readSource("/src/app/routing/route-error.ts")

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
    const routerSource = (
      await Promise.all([
        "router.tsx",
        "route-roots.tsx",
        "route-shell.tsx",
        "route-groups/content-routes.tsx",
      ].map((path) => readSource(`/src/app/routing/${path}`)))
    ).join("\n")
    const pageSource = await readSource("/src/features/pages/pages/page.tsx")
    const databaseSource = await readSource("/src/features/databases/pages/database.tsx")
    const meetingSource = await readSource("/src/features/meetings/pages/meeting.tsx")

    for (const source of [pageSource, databaseSource]) {
      assert.match(source, /if \(publishedShare === "public"\)/)
      assert.doesNotMatch(source, /!session\?\.user \|\| publishedShare/)
      assert.match(source, /<AuthenticatedRouteError resource=/)
    }

    assert.doesNotMatch(pageSource, /fallback=\{<PublicPage \/>\}/)
    assert.doesNotMatch(databaseSource, /fallback=\{publicPage\}/)
    assert.match(routerSource, /component: RootRouteShell/)
    assert.match(routerSource, /<AppLayout>\s*<Outlet \/>\s*<\/AppLayout>/)
    assert.match(routerSource, /authenticatedMeeting/)
    assert.match(routerSource, /component: Outlet,\s*pendingComponent: AppContentPendingPage/)
    assert.doesNotMatch(routerSource, /staleTime: 0/)
    assert.doesNotMatch(pageSource, /import \{ AppLayout \}/)
    assert.doesNotMatch(databaseSource, /import \{ AppLayout \}/)
    assert.doesNotMatch(meetingSource, /import \{ AppLayout \}/)
  })
}
