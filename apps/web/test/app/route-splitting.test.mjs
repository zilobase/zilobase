const routeGroups = [
  "app-routes",
  "content-routes",
  "public-routes",
  "settings-routes",
]

export function register({ assert, readSource, test }) {
  test("top-level routes load feature pages on demand", async () => {
    const sources = await Promise.all(
      routeGroups.map((name) =>
        readSource(`/src/app/routing/route-groups/${name}.tsx`),
      ),
    )

    for (const source of sources) {
      assert.match(source, /lazyRouteComponent/)
      assert.match(source, /\(\) => import\("@\/features\//)
      assert.doesNotMatch(source, /import [^\n]+ from "@\/features\/[^\n]+\/pages\//)
    }
  })

  test("the application shell and expensive optional surfaces are lazy", async () => {
    const [routeShell, appLayout, tasks] = await Promise.all([
      readSource("/src/app/routing/route-shell.tsx"),
      readSource("/src/app/shell/content/app-layout.tsx"),
      readSource("/src/features/tasks/pages/tasks.tsx"),
    ])

    assert.match(routeShell, /const AppLayout = lazy/)
    assert.match(routeShell, /fallback=\{<PendingPage \/>\}/)
    assert.match(appLayout, /const ChatSidebarPanel = lazy/)
    assert.match(appLayout, /chatSidebarOpen \? \(/)
    assert.match(tasks, /const DatabaseListView = lazy/)
    assert.match(tasks, /const DatabaseSetupCard = lazy/)
    assert.match(tasks, /const DatabaseViewToolbar = lazy/)
  })
}
