export function register({ assert, loadModule, test }) {
  test("timeline translates grouped drops into the same atomic intention as Kanban", async () => {
    const { getTimelineRowMove, indexTimelineGroupSections } = await loadModule(
      "/src/features/databases/views/timeline/model/database-timeline-row-move.ts",
    );
    const { getGroupedRecordMove } = await loadModule(
      "/src/features/databases/views/model/database-record-drop.ts",
    );
    const items = ["a", "b", "c"].map((id, position) => ({
      id,
      pageId: id,
      page: { name: id },
      position,
    }));
    const sections = [
      { id: "old", groupValue: "old", rows: [items[0]] },
      { id: "new", groupValue: "new", rows: items.slice(1) },
    ];
    for (const property of [
      { id: "status", property: { id: "status", type: "multi_select" } },
      { id: "name", property: { id: "name", type: "text" } },
      { id: "created", property: { id: "created", type: "created_time" } },
    ]) {
      const values = { "a:status": ["old", "other"] };
      const expected = getGroupedRecordMove({
        rows: items,
        targetRows: sections[1].rows,
        rowId: "a",
        targetIndex: 1,
        sourceGroupValue: "old",
        targetGroupValue: "new",
        property,
        propertyValuesByKey: values,
      });
      assert.deepEqual(
        getTimelineRowMove({
          draggedRowId: "a",
          dropTargetIndex: 2,
          groupProperty: property,
          groupSectionByRowId: indexTimelineGroupSections(sections),
          groupedSections: sections,
          isFiltered: false,
          isGrouped: true,
          isSorted: false,
          items,
          propertyValuesByKey: values,
          rowsById: new Map(items.map((row) => [row.id, row])),
          sortedItems: items,
          visibleRows: items,
        }),
        expected,
      );
    }
  });
}
