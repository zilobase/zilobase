export function register({ assert, loadModule, test }) {
  test("status property settings show every workflow group in order", async () => {
    const { getStatusOptionGroups } = await loadModule(
      "/src/features/databases/schema/configuration/status/status-property-settings-model.ts"
    )

    const groups = getStatusOptionGroups([
      { group: "Complete", id: "done", name: "Done" },
      { group: "Review", id: "review", name: "Review" },
      { group: "Backlog", id: "backlog", name: "Backlog" },
      { group: "In progress", id: "active", name: "Active" },
    ])

    assert.deepEqual(
      groups.map((group) => group.name),
      ["Backlog", "To-do", "In progress", "Review", "Complete"]
    )
    assert.deepEqual(
      groups.map((group) => group.options.map((option) => option.id)),
      [["backlog"], [], ["active"], ["review"], ["done"]]
    )
  })
}
