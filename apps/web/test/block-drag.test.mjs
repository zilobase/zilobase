export function register({ assert, loadModule, test }) {
  test("block drag insert pos picks before or after block midpoint", async () => {
    const { resolveBlockInsertPos } = await loadModule(
      "/src/editor/components/editor/block-drag.ts"
    )

    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 110), 10)
    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 130), 14)
    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 119), 10)
  })

  test("database block drag image keeps the block anchored when dragging from the handle", async () => {
    const { getDatabaseBlockDragImagePlacement } = await loadModule(
      "/src/editor/components/editor/block-drag.ts"
    )

    assert.deepEqual(getDatabaseBlockDragImagePlacement(700, 120, 744, 100), {
      offsetX: 0,
      offsetY: 20,
      paddingLeft: 44,
    })
  })
}
