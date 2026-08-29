export function register({ assert, loadModule, test }) {
  test("database cell content owns the wrap state", async () => {
    const { DatabaseCellContent } = await loadModule(
      "/src/features/databases/views/view/database-cell-content.tsx"
    )

    const wrappedCell = DatabaseCellContent({
      children: "A long value",
      wrapContent: true,
    })
    const unwrappedCell = DatabaseCellContent({
      children: "A long value",
    })

    assert.equal(wrappedCell.props.className, "database-cell-content")
    assert.equal(wrappedCell.props["data-wrap-content"], "true")
    assert.equal(unwrappedCell.props["data-wrap-content"], "false")
  })
}
