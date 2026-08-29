export function register({ assert, loadModule, test }) {
  test("timeline drop targeting reuses measured row centers", async () => {
    const { getTimelineRowDropTargetIndex } = await loadModule(
      "/src/editor/extensions/database/views/timeline/database-timeline-layout.ts"
    )
    const rowIds = ["row-1", "row-2", "row-3"]
    const centers = { "row-1": 48, "row-2": 80, "row-3": 132 }

    assert.equal(getTimelineRowDropTargetIndex(rowIds, centers, 10), 0)
    assert.equal(getTimelineRowDropTargetIndex(rowIds, centers, 47), 0)
    assert.equal(getTimelineRowDropTargetIndex(rowIds, centers, 48), 1)
    assert.equal(getTimelineRowDropTargetIndex(rowIds, centers, 100), 2)
    assert.equal(getTimelineRowDropTargetIndex(rowIds, centers, 200), 3)
  })

  test("timeline row layout equality detects meaningful geometry changes", async () => {
    const { timelineRowLayoutsMatch } = await loadModule(
      "/src/editor/extensions/database/views/timeline/database-timeline-layout.ts"
    )
    const layout = {
      centers: { "row-1": 48, "row-2": 80 },
      dropTops: [32, 64, 96],
    }

    assert.equal(timelineRowLayoutsMatch(layout, { ...layout }), true)
    assert.equal(
      timelineRowLayoutsMatch(layout, {
        centers: { ...layout.centers, "row-2": 81 },
        dropTops: layout.dropTops,
      }),
      false
    )
  })
}
