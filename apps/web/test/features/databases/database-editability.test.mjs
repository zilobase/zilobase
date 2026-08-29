export function register({ assert, loadModule, test }) {
  test("an online database remains editable when page collaboration is blocked", async () => {
    const { canEditOnlineDatabase } = await loadModule(
      "/src/features/editor/database-editability.ts",
    )

    assert.equal(
      canEditOnlineDatabase({
        connectivity: "online",
        offlineSessionLocked: false,
        pageEditable: true,
      }),
      true,
    )
  })

  test("database mutations stay disabled offline or after session expiry", async () => {
    const { canEditOnlineDatabase } = await loadModule(
      "/src/features/editor/database-editability.ts",
    )

    assert.equal(
      canEditOnlineDatabase({
        connectivity: "offline",
        offlineSessionLocked: false,
        pageEditable: true,
      }),
      false,
    )
    assert.equal(
      canEditOnlineDatabase({
        connectivity: "online",
        offlineSessionLocked: true,
        pageEditable: true,
      }),
      false,
    )
  })

  test("a locked page makes its embedded database runtime read-only", async () => {
    const { canEditOnlineDatabase } = await loadModule(
      "/src/features/editor/database-editability.ts",
    )

    assert.equal(
      canEditOnlineDatabase({
        connectivity: "online",
        offlineSessionLocked: false,
        pageEditable: false,
      }),
      false,
    )
  })
}
