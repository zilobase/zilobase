export function register({ assert, loadModule, test }) {
  test("sidebar panel sizing resolves percentage and fixed widths", async () => {
    const { resolveSidebarPanelPercentage } = await loadModule(
      "/src/components/sidebar-panel-sizing.ts",
    )

    assert.equal(resolveSidebarPanelPercentage("28%", 1000), 28)
    assert.equal(resolveSidebarPanelPercentage("320px", 1280), 25)
    assert.equal(resolveSidebarPanelPercentage("320px", 0), 0)
  })

  test("two right sidebars use a 2:1:1 editor layout", async () => {
    const {
      getRightSidebarEditorDefaultSize,
      getRightSidebarDockMinSize,
      RIGHT_SIDEBAR_INNER_SPLIT_SIZE,
      RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE,
    } = await loadModule("/src/components/sidebar-panel-sizing.ts")

    assert.equal(getRightSidebarEditorDefaultSize(2), "50%")
    assert.equal(RIGHT_SIDEBAR_INNER_SPLIT_SIZE, 50)
    assert.equal(RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE, 25)
    assert.equal(getRightSidebarDockMinSize(false, true), 28)
    assert.equal(getRightSidebarDockMinSize(false, false), 18)
    assert.equal(getRightSidebarDockMinSize(true, true), 50)
  })

  test("a single view settings sidebar matches the navigation sidebar width", async () => {
    const {
      APP_SIDEBAR_PANEL_WIDTH,
      getRightSidebarDockSizes,
    } = await loadModule("/src/components/sidebar-panel-sizing.ts")

    assert.equal(APP_SIDEBAR_PANEL_WIDTH, "288px")
    assert.deepEqual(
      getRightSidebarDockSizes({
        fixedSinglePanelWidth: APP_SIDEBAR_PANEL_WIDTH,
        navigationSidebarOpen: true,
        splitDock: false,
      }),
      {
        defaultSize: "288px",
        maxSize: "288px",
        minSize: "288px",
      },
    )
    assert.deepEqual(
      getRightSidebarDockSizes({
        fixedSinglePanelWidth: APP_SIDEBAR_PANEL_WIDTH,
        navigationSidebarOpen: true,
        splitDock: true,
      }),
      {
        defaultSize: "50%",
        maxSize: "50%",
        minSize: "50%",
      },
    )
  })

  test("right sidebar resize gestures resolve directional intent", async () => {
    const { getSidebarResizeIntent } = await loadModule(
      "/src/components/sidebar-panel-sizing.ts",
    )

    assert.equal(getSidebarResizeIntent(-10), "increase")
    assert.equal(getSidebarResizeIntent(10), "decrease")
    assert.equal(getSidebarResizeIntent(3), null)
  })
}
