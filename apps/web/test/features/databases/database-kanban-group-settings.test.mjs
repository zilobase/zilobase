export function register({ assert, loadModule, test }) {
  const model = () =>
    loadModule("/src/features/databases/views/kanban/model/database-kanban-group-settings.ts");
  test("kanban visibility settings preserve unrelated view config and other grouping properties", async () => {
    const { getKanbanGroupSettings: read, updateKanbanGroupSettings: update } = await model();
    const initial = {
      sorts: [{ column: "name", direction: "asc" }],
      kanbanGroups: { priority: { hiddenGroupIds: ["low"] } },
    };
    const next = update(initial, "status", { hiddenGroupIds: ["done"] });
    const counts = update(next, "status", { hiddenCountGroupIds: ["todo"] });
    assert.deepEqual(counts.sorts, initial.sorts);
    assert.deepEqual(read(counts, "priority").hiddenGroupIds, ["low"]);
    assert.deepEqual(read(counts, "status"), {
      hiddenGroupIds: ["done"],
      hiddenCountGroupIds: ["todo"],
    });
    assert.deepEqual(
      read(update(counts, "status", { hiddenGroupIds: [] }), "status").hiddenGroupIds,
      [],
    );
    assert.deepEqual(
      read({ kanbanGroups: { status: { hiddenGroupIds: ["done", 1] } } }, "status").hiddenGroupIds,
      ["done"],
    );
  });
  test("kanban group trash includes all matching pages and deduplicates multiple rows", async () => {
    const { getKanbanGroupPageIds: pages } = await model();
    const allRows = [
      { pageId: "one", groups: ["Todo"] },
      { pageId: "two", groups: ["Todo", "Review"] },
      { pageId: "two", groups: ["Todo"] },
      { pageId: "three", groups: [] },
      { pageId: "four", groups: ["Done"] },
    ];
    assert.deepEqual(
      pages(allRows, "Todo", (row) => row.groups),
      ["one", "two"],
    );
    assert.deepEqual(
      pages(allRows, "", (row) => row.groups),
      ["three"],
    );
    assert.deepEqual(
      pages(allRows, "Missing", (row) => row.groups),
      [],
    );
  });
}
