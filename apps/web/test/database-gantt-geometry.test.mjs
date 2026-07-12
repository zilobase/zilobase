export function register({ assert, loadModule, test }) {
  test("gantt daily geometry snaps previews to exact columns", async () => {
    const { getGanttSelection } = await loadModule(
      "/src/components/kibo-ui/gantt/gantt-geometry.ts"
    )
    const geometry = {
      columnWidth: 50,
      range: "daily",
      timelineStart: new Date(2026, 0, 1),
      timelineWidth: 365 * 50,
    }

    const selection = getGanttSelection(126, 5, geometry)

    assert.equal(selection.left, 100)
    assert.equal(selection.width, 250)
    assert.deepEqual(
      [
        selection.startAt.getFullYear(),
        selection.startAt.getMonth(),
        selection.startAt.getDate(),
      ],
      [2026, 0, 3]
    )
    assert.equal(selection.endAt.getDate(), 8)
  })

  test("gantt preview stays inside the final timeline column", async () => {
    const { getGanttSelection } = await loadModule(
      "/src/components/kibo-ui/gantt/gantt-geometry.ts"
    )
    const geometry = {
      columnWidth: 50,
      range: "daily",
      timelineStart: new Date(2026, 0, 1),
      timelineWidth: 10 * 50,
    }

    const selection = getGanttSelection(499, 5, geometry)

    assert.equal(selection.left, 250)
    assert.equal(selection.width, 250)
  })

  test("gantt date and pixel conversion share one coordinate model", async () => {
    const { dateToTimelineX, timelineXToDate } = await loadModule(
      "/src/components/kibo-ui/gantt/gantt-geometry.ts"
    )
    const geometry = {
      columnWidth: 50,
      range: "daily",
      timelineStart: new Date(2026, 0, 1),
    }
    const date = new Date(2026, 6, 13)
    const x = dateToTimelineX(date, geometry)

    assert.equal(timelineXToDate(x, geometry).getTime(), date.getTime())
  })

  test("gantt single-date items retain one full daily column", async () => {
    const { getTimelineItemWidth } = await loadModule(
      "/src/components/kibo-ui/gantt/gantt-geometry.ts"
    )
    const date = new Date(2026, 0, 3)

    assert.equal(
      getTimelineItemWidth(date, date, {
        columnWidth: 50,
        range: "daily",
        timelineStart: new Date(2026, 0, 1),
      }),
      50
    )
  })

  test("gantt preview hides synchronously before a row can remount", async () => {
    const {
      hideGanttPreview,
      shouldPositionGanttPreviewOnFocus,
      showGanttPreview,
    } = await loadModule(
      "/src/components/kibo-ui/gantt/gantt-preview.ts"
    )
    const properties = new Map()
    const element = {
      dataset: {},
      style: {
        setProperty(name, value) {
          properties.set(name, value)
        },
      },
    }
    const selection = {
      endAt: new Date(2026, 0, 8),
      left: 100,
      startAt: new Date(2026, 0, 3),
      width: 250,
    }

    showGanttPreview(element, selection)
    assert.equal(element.dataset.previewVisible, "true")
    assert.equal(properties.get("--gantt-add-left"), "100px")
    assert.equal(properties.get("--gantt-add-width"), "250px")
    assert.equal(properties.get("--gantt-add-opacity"), "1")

    hideGanttPreview(element)
    assert.equal(element.dataset.previewVisible, "false")
    assert.equal(properties.get("--gantt-add-opacity"), "0")

    assert.equal(
      shouldPositionGanttPreviewOnFocus({ matches: () => false }),
      false
    )
    assert.equal(
      shouldPositionGanttPreviewOnFocus({ matches: () => true }),
      true
    )
  })
}
