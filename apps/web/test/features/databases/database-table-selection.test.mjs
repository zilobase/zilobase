export function register({ assert, loadModule, test }) {
  test("database table selection keeps only five property actions visible", async () => {
    const {
      DATABASE_SELECTION_PRIMARY_PROPERTY_LIMIT,
      splitDatabaseSelectionProperties,
    } = await loadModule(
      "/src/features/databases/views/table/model/database-table-selection.ts"
    )
    const properties = ["status", "assignee", "date", "priority", "type", "effort"]
    const groups = splitDatabaseSelectionProperties(properties)

    assert.equal(DATABASE_SELECTION_PRIMARY_PROPERTY_LIMIT, 5)
    assert.deepEqual(groups.primary, properties.slice(0, 5))
    assert.deepEqual(groups.overflow, ["effort"])
  })

  test("database table selection reports shared and mixed property values", async () => {
    const { getSharedDatabaseSelectionValue } = await loadModule(
      "/src/features/databases/views/table/model/database-table-selection.ts"
    )
    const areEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right)

    assert.deepEqual(
      getSharedDatabaseSelectionValue(["Open", "Open"], areEqual),
      { mixed: false, value: "Open" }
    )
    assert.deepEqual(
      getSharedDatabaseSelectionValue(["Open", "Done"], areEqual),
      { mixed: true, value: "" }
    )
    assert.deepEqual(
      getSharedDatabaseSelectionValue([["A", "B"], ["A", "B"]], areEqual),
      { mixed: false, value: ["A", "B"] }
    )
  })
}
