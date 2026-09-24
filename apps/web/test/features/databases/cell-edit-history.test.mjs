export function register({ assert, loadModule, test }) {
  test("bulk edit undo and redo preserve intervening edits and apply current values", async () => {
    const { createCellEditHistoryAction } = await loadModule(
      "/src/features/databases/interactions/cell-edit-history.ts",
    );
    const values = { "p1:status": "Done", "p2:status": "Changed elsewhere" };
    const calls = [];
    const action = createCellEditHistoryAction({
      label: "Bulk edit",
      changes: ["1", "2"].map((id) => ({
        rowId: `r${id}`,
        pageId: `p${id}`,
        propertyId: "status",
        propertyType: "status",
        previousValue: "Todo",
        nextValue: "Done",
      })),
      readValues: () => values,
      savePropertyValue: (rowId, propertyId, _type, before, after) => {
        calls.push([rowId, before, after]);
        values[`${rowId.replace("r", "p")}:${propertyId}`] = after;
      },
      runWithoutRecording: (run) => {
        calls.push("without-recording");
        run();
      },
    });
    assert.equal(action.undo(), true);
    assert.deepEqual(calls, ["without-recording", ["r1", "Done", "Todo"]]);
    assert.equal(values["p2:status"], "Changed elsewhere");
    assert.equal(action.redo(), true);
    assert.deepEqual(calls.at(-1), ["r1", "Todo", "Done"]);
    values["p1:status"] = "Another edit";
    assert.equal(action.undo(), false);
    assert.equal(action.redo(), false);
    assert.equal(values["p1:status"], "Another edit");
  });
}
