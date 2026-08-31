export function register({ assert, loadModule, test }) {
  test("hosted demo keeps supported page and database edits local", async () => {
    const originalWindow = globalThis.window
    const demoWindow = new EventTarget()
    let resetPath = null
    demoWindow.location = {
      assign: (path) => { resetPath = path },
      hostname: "demo.zilobase.com",
    }
    globalThis.window = demoWindow

    const runtime = await loadModule("/src/features/demo/runtime.ts")
    assert.equal(runtime.isHostedDemoRuntime({ hostname: "demo.localhost" }), true)
    assert.equal(
      runtime.isAllowedDemoParent(
        new URL("http://localhost:4321"),
        { hostname: "demo.localhost" },
      ),
      true,
    )
    assert.equal(
      runtime.isAllowedDemoParent(
        new URL("https://unrelated.example"),
        { hostname: "demo.localhost" },
      ),
      false,
    )
    let cleared = false
    const database = {
      activeDataSource: null,
      dataSources: [],
      database: { id: "demo-db", version: 4 },
      rows: [],
    }
    const page = {
      page: { id: "demo-page", name: "Start here", updatedAt: "old" },
    }

    runtime.installDemoCache({
      clear: () => { cleared = true },
      getQueriesData: () => [[ ["database", "demo-db"], database ]],
      getQueryData: (key) => key[0] === "page" ? page : undefined,
    })

    try {
      const cellResult = runtime.interceptDemoMutation(
        "/databases/demo-db/rows/demo-row/properties/demo-status",
        "PUT",
        JSON.stringify({ value: "In progress" }),
      )
      assert.equal(cellResult.handled, true)
      assert.equal(cellResult.value.version, 5)
      assert.match(cellResult.value.mutationId, /^demo-local-/)

      const databaseOverlay = runtime.applyDemoReadOverlay(
        "/databases/demo-db",
        database,
      )
      assert.equal(databaseOverlay.database.version, 5)

      const visitResult = runtime.interceptDemoMutation(
        "/pages/item-visits",
        "POST",
        JSON.stringify({
          itemId: "demo-page",
          itemKind: "page",
          workspaceId: "demo-workspace",
        }),
      )
      assert.equal(visitResult.handled, true)
      assert.equal(visitResult.value.itemId, "demo-page")
      assert.equal(visitResult.value.itemKind, "page")
      assert.match(visitResult.value.lastVisitedAt, /^\d{4}-\d{2}-\d{2}T/)

      const titleResult = runtime.interceptDemoMutation(
        "/pages/demo-page",
        "PATCH",
        JSON.stringify({ name: "Edited locally" }),
      )
      assert.equal(titleResult.handled, true)
      const pageOverlay = runtime.applyDemoReadOverlay("/pages/demo-page", page)
      assert.equal(pageOverlay.page.name, "Edited locally")

      runtime.resetHostedDemo()
      assert.equal(cleared, true)
      assert.equal(resetPath, runtime.DEMO_START_PATH)
    } finally {
      if (originalWindow === undefined) delete globalThis.window
      else globalThis.window = originalWindow
    }
  })

  test("hosted demo guards unsupported writes and leaves normal origins unchanged", async () => {
    const originalWindow = globalThis.window
    const demoWindow = new EventTarget()
    demoWindow.location = { hostname: "demo.zilobase.com" }
    globalThis.window = demoWindow
    const runtime = await loadModule("/src/features/demo/runtime.ts")

    try {
      assert.throws(
        () => runtime.interceptDemoMutation(
          "/ai/conversations/demo/messages",
          "POST",
          JSON.stringify({ prompt: "Run the model" }),
        ),
        (error) => error instanceof runtime.DemoGuardError &&
          error.status === 403 &&
          error.body.code === "DEMO_READ_ONLY",
      )

      demoWindow.location = { hostname: "app.zilobase.com" }
      assert.deepEqual(
        runtime.interceptDemoMutation(
          "/pages",
          "POST",
          JSON.stringify({ name: "Real page" }),
        ),
        { handled: false },
      )
    } finally {
      if (originalWindow === undefined) delete globalThis.window
      else globalThis.window = originalWindow
    }
  })
}
