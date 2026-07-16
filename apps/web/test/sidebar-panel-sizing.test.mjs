export function register({ assert, loadModule, test }) {
  test("sidebar panel sizing resolves percentage and fixed widths", async () => {
    const { resolveSidebarPanelPercentage } = await loadModule(
      "/src/components/sidebar-panel-sizing.ts",
    )

    assert.equal(resolveSidebarPanelPercentage("28%", 1000), 28)
    assert.equal(resolveSidebarPanelPercentage("320px", 1280), 25)
    assert.equal(resolveSidebarPanelPercentage("320px", 0), 0)
  })

  test("sidebar panel closing finishes at an exact collapsed size", async () => {
    const { interpolateSidebarPanelPercentage } = await loadModule(
      "/src/components/sidebar-panel-sizing.ts",
    )

    assert.equal(interpolateSidebarPanelPercentage(28, 0, 0), 28)
    assert.equal(interpolateSidebarPanelPercentage(28, 0, 1), 0)
    assert.equal(interpolateSidebarPanelPercentage(28, 0, 2), 0)
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

  test("right sidebar resize gestures resolve directional intent", async () => {
    const { getSidebarResizeIntent } = await loadModule(
      "/src/components/sidebar-panel-sizing.ts",
    )

    assert.equal(getSidebarResizeIntent(-10), "increase")
    assert.equal(getSidebarResizeIntent(10), "decrease")
    assert.equal(getSidebarResizeIntent(3), null)
  })
}
