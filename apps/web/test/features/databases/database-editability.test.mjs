export function register({ assert, loadModule, test }) {
  test("an editable page keeps its database editable", async () => {
    const { canEditOnlineDatabase } = await loadModule(
      "/src/features/editor/database-editability.ts",
    )

    assert.equal(
      canEditOnlineDatabase({
        pageEditable: true,
      }),
      true,
    )
  })

  test("a locked page makes its embedded database runtime read-only", async () => {
    const { canEditOnlineDatabase } = await loadModule(
      "/src/features/editor/database-editability.ts",
    )

    assert.equal(
      canEditOnlineDatabase({
        pageEditable: false,
      }),
      false,
    )
  })
}
