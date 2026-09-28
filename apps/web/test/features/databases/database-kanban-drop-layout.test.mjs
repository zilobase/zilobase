export function register({ assert, loadModule, test }) {
  const model = () => loadModule("/src/features/databases/views/model/database-record-drop.ts");
  const projection = () => loadModule("/packages/features/src/databases/interactions/model.ts");
  const rows = ["a", "b", "c"].map((id) => ({
    id,
    pageId: id,
    dataSourceId: "source",
    valuesByPropertyId: {},
    page: { name: id },
  }));
  const property = (type = "status") => ({ id: "status", property: { id: "status", type } });
  const operation = (move) => ({
    id: "gesture",
    status: "saving",
    effects: [
      {
        dataSourceId: "source",
        rowId: move.rowId,
        placement: { afterRowId: move.afterRowId, beforeRowId: move.beforeRowId },
        title: move.pageTitle,
        ...(move.group ? { values: { [move.group.propertyId]: move.group.serializedValue } } : {}),
      },
    ],
  });
  const project = async (move) =>
    (await projection()).projectRecordInteractions(rows, move ? [operation(move)] : [], {
      dataSourceId: "source",
      sourceVersion: 1,
    });

  test("Kanban preview geometry matches the shared post-drop projection at every insertion point", async () => {
    const { getGroupedRecordMove } = await model();
    const { getKanbanCardPreview } = await loadModule(
      "/src/features/databases/views/kanban/model/database-kanban-card-drag.ts",
    );
    const heights = [40, 80, 60];
    for (const sourceIndex of [0, 1, 2])
      for (const targetIndex of [0, 1, 2, 3]) {
        const move = getGroupedRecordMove({
          rows,
          targetRows: rows,
          rowId: rows[sourceIndex].id,
          targetIndex,
          sourceGroupValue: "Todo",
          targetGroupValue: "Todo",
          property: property(),
          propertyValuesByKey: {},
        });
        const final = await project(move);
        const preview = getKanbanCardPreview({
          heights,
          gap: 8,
          draggedHeight: heights[sourceIndex],
          sourceIndex,
          targetIndex,
        });
        const tops = new Map();
        let top = 0;
        final.forEach((row) => {
          tops.set(row.id, top);
          top += heights[rows.findIndex(({ id }) => id === row.id)] + 8;
        });
        let originalTop = 0;
        rows.forEach((row, index) => {
          assert.equal(
            tops.get(row.id),
            index === sourceIndex ? preview.placeholderTop : originalTop + preview.offsets[index],
          );
          originalTop += heights[index] + 8;
        });
      }
  });

  test("shared grouped drops preserve multi-select memberships without duplicate cards", async () => {
    const { getGroupedRecordMove } = await model();
    const move = getGroupedRecordMove({
      rows,
      targetRows: rows,
      rowId: "a",
      targetIndex: 2,
      sourceGroupValue: "Todo",
      targetGroupValue: "Done",
      property: property("multi_select"),
      propertyValuesByKey: { "a:status": ["Todo", "Done", "Other"] },
    });
    const result = await project(move);
    assert.deepEqual(
      result.map(({ id }) => id),
      ["b", "a", "c"],
    );
    assert.deepEqual(result[1].valuesByPropertyId.status.value, ["Done", "Other"]);
    assert.deepEqual(rows[0].valuesByPropertyId, {});
  });

  test("empty title groups and read-only grouping follow the same intention rules", async () => {
    const { getGroupedRecordMove } = await model();
    const input = {
      rows,
      targetRows: [],
      rowId: "c",
      targetIndex: 0,
      sourceGroupValue: "c",
      targetGroupValue: "New title",
      propertyValuesByKey: {},
    };
    const move = getGroupedRecordMove({
      ...input,
      property: { id: "name", property: { id: "name", type: "text" } },
    });
    const result = await project(move);
    assert.deepEqual(
      result.map(({ id }) => id),
      ["c", "a", "b"],
    );
    assert.equal(result[0].page.name, "New title");
    assert.equal(getGroupedRecordMove({ ...input, property: property("created_time") }), null);
  });
}
