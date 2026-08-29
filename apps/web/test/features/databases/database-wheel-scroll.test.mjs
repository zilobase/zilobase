export function register({ assert, loadModule, test }) {
  test("database horizontal scroll clamps elastic overscroll at both edges", async () => {
    const { getClampedDatabaseScrollLeft } = await loadModule(
      "/src/features/databases/interactions/database-wheel-scroll.ts"
    )
    const metrics = {
      clientWidth: 600,
      scrollLeft: 100,
      scrollWidth: 1000,
    }

    assert.equal(getClampedDatabaseScrollLeft(metrics, -200), 0)
    assert.equal(getClampedDatabaseScrollLeft(metrics, 500), 400)
    assert.equal(
      getClampedDatabaseScrollLeft({ ...metrics, scrollLeft: -30 }),
      0
    )
    assert.equal(
      getClampedDatabaseScrollLeft({ ...metrics, scrollLeft: 450 }),
      400
    )
  })

  test("database horizontal rubber-band offset mirrors onto the synchronized section", async () => {
    const { getDatabaseHorizontalScrollSync } = await loadModule(
      "/src/features/databases/interactions/database-wheel-scroll.ts"
    )
    const baseMetrics = { clientWidth: 600, scrollWidth: 1000 }

    assert.deepEqual(
      getDatabaseHorizontalScrollSync(
        { ...baseMetrics, scrollLeft: -20 },
        0
      ),
      { isRubberBanding: true, rubberBandOffset: 20, scrollLeft: 0 }
    )
    assert.deepEqual(
      getDatabaseHorizontalScrollSync(
        { ...baseMetrics, scrollLeft: 420 },
        400
      ),
      { isRubberBanding: true, rubberBandOffset: -20, scrollLeft: 400 }
    )
    assert.deepEqual(
      getDatabaseHorizontalScrollSync(
        { ...baseMetrics, scrollLeft: 200 },
        160
      ),
      { isRubberBanding: false, rubberBandOffset: 0, scrollLeft: 200 }
    )
  })

  test("database horizontal wheel gestures preserve rubber-band behavior at scroll edges", async () => {
    const { getDatabaseHorizontalWheelScrollLeft } = await loadModule(
      "/src/features/databases/interactions/database-wheel-scroll.ts"
    )
    const baseEvent = { deltaY: 0, shiftKey: false }
    const baseMetrics = { clientWidth: 600, scrollWidth: 1000 }

    assert.deepEqual(
      getDatabaseHorizontalWheelScrollLeft(
        { ...baseEvent, deltaX: -80 },
        { ...baseMetrics, scrollLeft: 0 }
      ),
      { scrollLeft: 0, shouldConsume: false }
    )
    assert.deepEqual(
      getDatabaseHorizontalWheelScrollLeft(
        { ...baseEvent, deltaX: 80 },
        { ...baseMetrics, scrollLeft: 400 }
      ),
      { scrollLeft: 400, shouldConsume: false }
    )
    assert.equal(
      getDatabaseHorizontalWheelScrollLeft(
        { deltaX: 2, deltaY: 40, shiftKey: false },
        { ...baseMetrics, scrollLeft: 200 }
      ),
      null
    )
    assert.deepEqual(
      getDatabaseHorizontalWheelScrollLeft(
        { ...baseEvent, deltaX: 80 },
        { ...baseMetrics, scrollLeft: 200 }
      ),
      { scrollLeft: 280, shouldConsume: true }
    )
  })

  test("database wheel scroll ignores trackpad drift during vertical scroll", async () => {
    const { getDatabaseHorizontalWheelDelta } = await loadModule(
      "/src/features/databases/interactions/database-wheel-scroll.ts"
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
      "/src/features/databases/interactions/database-wheel-scroll.ts"
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
      "/src/features/databases/interactions/database-wheel-scroll.ts"
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
