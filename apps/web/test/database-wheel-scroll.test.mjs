export function register({ assert, loadModule, test }) {
  test("database wheel scroll ignores trackpad drift during vertical scroll", async () => {
    const { getDatabaseHorizontalWheelDelta } = await loadModule(
      "/src/editor/extensions/database/interactions/database-wheel-scroll.ts"
    )

    assert.equal(
      getDatabaseHorizontalWheelDelta({
        deltaX: 5,
        deltaY: 30,
        shiftKey: false,
      }),
      0
    )
  })

  test("database wheel scroll keeps deliberate horizontal gestures", async () => {
    const { getDatabaseHorizontalWheelDelta } = await loadModule(
      "/src/editor/extensions/database/interactions/database-wheel-scroll.ts"
    )

    assert.equal(
      getDatabaseHorizontalWheelDelta({
        deltaX: 30,
        deltaY: 5,
        shiftKey: false,
      }),
      30
    )
  })

  test("database wheel scroll supports shift wheel horizontal scrolling", async () => {
    const { getDatabaseHorizontalWheelDelta } = await loadModule(
      "/src/editor/extensions/database/interactions/database-wheel-scroll.ts"
    )

    assert.equal(
      getDatabaseHorizontalWheelDelta({
        deltaX: 0,
        deltaY: 20,
        shiftKey: true,
      }),
      20
    )
  })
}
