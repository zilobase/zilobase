export function register({ assert, loadModule, test }) {
  test("list drop indicators distinguish inactive, internal and external drags at row edges", async () => {
    const { listRowDragAttributes, listRowCompletionLabel } = await loadModule(
      "/src/features/databases/views/list/components/list-row-presentation.ts",
    );
    const idle = {
      draggedRowId: null,
      isExternalDragActive: false,
      dropTargetIndex: 1,
    };
    assert.deepEqual(listRowDragAttributes("row", 1, 3, idle), {
      "data-dragging": undefined,
      "data-drop-after": undefined,
      "data-drop-before": undefined,
    });
    const internal = { ...idle, draggedRowId: "row" };
    assert.equal(listRowDragAttributes("row", 1, 3, internal)["data-dragging"], "true");
    assert.equal(listRowDragAttributes("row", 1, 3, internal)["data-drop-before"], "true");
    const external = {
      ...idle,
      isExternalDragActive: true,
      dropTargetIndex: 3,
    };
    assert.equal(listRowDragAttributes("row", 2, 3, external)["data-drop-after"], "true");
    assert.equal(
      listRowDragAttributes("row", 1, 3, { ...external, dropTargetIndex: 2 })["data-drop-after"],
      undefined,
    );
    assert.equal(listRowCompletionLabel("", false), "Mark task as done");
    assert.equal(listRowCompletionLabel("Task", true), "Mark Task as not done");
  });
}
