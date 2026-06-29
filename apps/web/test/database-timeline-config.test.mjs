const databaseId = "database-1"

export function register({ assert, loadModule, test }) {
  test("timeline config parses single and range date values", async () => {
    const {
      parseRowDateRange,
      ganttMoveToCellValue,
      buildTimelineRowItem,
      groupTimelineRows,
      UNSCHEDULED_GROUP_NAME,
    } = await loadModule(
      "/src/editor/extensions/database/timeline/database-timeline-config.ts"
    )

    const singleDate = parseRowDateRange("2026-06-15")

    assert.equal(singleDate?.startAt.getFullYear(), 2026)
    assert.equal(singleDate?.startAt.getMonth(), 5)
    assert.equal(singleDate?.startAt.getDate(), 15)

    const rangeDate = parseRowDateRange(["2026-06-01", "2026-06-10"])

    assert.equal(rangeDate?.startAt.getDate(), 1)
    assert.equal(rangeDate?.endAt.getDate(), 10)
    assert.deepEqual(ganttMoveToCellValue(rangeDate.startAt, rangeDate.endAt), [
      "2026-06-01",
      "2026-06-10",
    ])

    const scheduledRow = buildTimelineRowItem({
      dateValue: "2026-06-15",
      groupName: "In progress",
      rowId: "row-1",
      rowName: "Launch",
      pageId: "page-1",
      status: { color: "#3B82F6", id: "in-progress", name: "In progress" },
    })
    const unscheduledRow = buildTimelineRowItem({
      dateValue: "",
      groupName: "In progress",
      rowId: "row-2",
      rowName: "Write docs",
      pageId: "page-2",
      status: { color: "#6B7280", id: "unscheduled", name: "Unscheduled" },
    })

    assert.equal(scheduledRow.feature?.name, "Launch")
    assert.equal(unscheduledRow.feature, null)

    const groupedRows = groupTimelineRows([
      { ...scheduledRow, groupName: "In progress" },
      { ...unscheduledRow, groupName: UNSCHEDULED_GROUP_NAME },
    ])

    assert.equal(groupedRows[0].groupName, "In progress")
    assert.equal(groupedRows[1].groupName, UNSCHEDULED_GROUP_NAME)
  })
}