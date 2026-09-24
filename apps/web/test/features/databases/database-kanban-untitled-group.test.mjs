export function register({ assert, loadModule, test }) {
  test("unnamed kanban groups receive a unique Untitled name", async () => {
    const { getUntitledKanbanGroupName: name } = await loadModule(
      "/src/features/databases/views/kanban/model/database-kanban-group-model.ts",
    );
    const option = (value) => ({ name: value, groupValue: value });
    assert.equal(name([]), "Untitled");
    assert.equal(name([option("Untitled")]), "Untitled 2");
    assert.equal(name([option(" untitled "), option("UNTITLED 2")]), "Untitled 3");
    assert.equal(name([{ name: "Different label", groupValue: "Untitled" }]), "Untitled 2");
    assert.equal(name([option("Untitled"), option("Untitled 3")]), "Untitled 2");
  });
}
