export function register({ assert, loadModule, test }) {
  test("database view switching ignores horizontal-only scroll containers", async () => {
    const { isVerticalScrollContainer } = await loadModule(
      "/src/features/databases/views/controller/database-view-scroll.ts",
    )

    assert.equal(
      isVerticalScrollContainer({
        clientHeight: 40,
        overflowY: "auto",
        scrollHeight: 40,
      }),
      false,
    )
  })

  test("database view switching identifies the page scroll container", async () => {
    const {
      captureDatabaseViewScroll,
      isVerticalScrollContainer,
      restoreDatabaseViewScroll,
    } = await loadModule(
      "/src/features/databases/views/controller/database-view-scroll.ts",
    )

    assert.equal(
      isVerticalScrollContainer({
        clientHeight: 800,
        overflowY: "auto",
        scrollHeight: 1800,
      }),
      true,
    )
    assert.equal(
      isVerticalScrollContainer({
        clientHeight: 800,
        overflowY: "visible",
        scrollHeight: 1800,
      }),
      false,
    )

    const pageScrollElement = {
      clientHeight: 800,
      overflowY: "auto",
      parentElement: null,
      scrollHeight: 1800,
      scrollTop: 420,
    }
    const horizontalTabs = {
      clientHeight: 40,
      overflowY: "auto",
      parentElement: pageScrollElement,
      scrollHeight: 40,
      scrollTop: 0,
    }
    const anchor = {
      ownerDocument: {
        defaultView: {
          getComputedStyle: (element) => ({ overflowY: element.overflowY }),
        },
        scrollingElement: null,
      },
      parentElement: horizontalTabs,
    }
    const snapshot = captureDatabaseViewScroll(anchor)

    assert.equal(snapshot.scrollElement, pageScrollElement)
    assert.equal(snapshot.scrollTop, 420)

    pageScrollElement.scrollTop = 0
    restoreDatabaseViewScroll(snapshot)
    assert.equal(pageScrollElement.scrollTop, 420)
  })

  test("database view switching keeps its scroll position while the next view settles", async () => {
    const { restoreDatabaseViewScrollAfterLayout } = await loadModule(
      "/src/features/databases/views/controller/database-view-scroll.ts",
    )
    const pendingFrames = new Map()
    const cancelledFrames = new Set()
    let nextFrameId = 1
    const ownerWindow = {
      cancelAnimationFrame: (frameId) => cancelledFrames.add(frameId),
      requestAnimationFrame: (callback) => {
        const frameId = nextFrameId++
        pendingFrames.set(frameId, callback)
        return frameId
      },
    }
    const scrollElement = {
      ownerDocument: { defaultView: ownerWindow },
      scrollTop: 420,
    }
    const cleanup = restoreDatabaseViewScrollAfterLayout({
      scrollElement,
      scrollTop: 420,
    })

    scrollElement.scrollTop = 0
    pendingFrames.get(1)()
    assert.equal(scrollElement.scrollTop, 420)

    scrollElement.scrollTop = 0
    pendingFrames.get(2)()
    assert.equal(scrollElement.scrollTop, 420)

    cleanup()
    assert.deepEqual([...cancelledFrames], [1, 2])
  })

  test("table rows stay mounted until page virtualization is ready", async () => {
    const { shouldRenderVirtualizedDatabaseRows } = await loadModule(
      "/src/features/databases/views/controller/database-view-scroll.ts",
    )

    assert.equal(
      shouldRenderVirtualizedDatabaseRows({
        hasScrollElement: false,
        virtualRowCount: 0,
        virtualizationEnabled: true,
      }),
      false,
    )
    assert.equal(
      shouldRenderVirtualizedDatabaseRows({
        hasScrollElement: true,
        virtualRowCount: 8,
        virtualizationEnabled: true,
      }),
      true,
    )
  })
}
