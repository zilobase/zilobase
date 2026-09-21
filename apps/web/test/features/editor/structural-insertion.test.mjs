export function register({ assert, loadModule, test }) {
  test("structural insertion stays pending until the created block is inserted", async () => {
    const { runStructuralInsertion } = await loadModule(
      "/src/features/editor/commands/structural-insertion.ts",
    )
    const events = []

    const created = await runStructuralInsertion({
      create: async () => {
        events.push("created")
        return "database-1"
      },
      insert: (databaseId) => events.push(`inserted:${databaseId}`),
      onPendingChange: (pending) => events.push(`pending:${pending}`),
    })

    assert.equal(created, "database-1")
    assert.deepEqual(events, [
      "pending:true",
      "created",
      "inserted:database-1",
      "pending:false",
    ])
  })

  test("failed structural creation always releases the recovery guard", async () => {
    const { runStructuralInsertion } = await loadModule(
      "/src/features/editor/commands/structural-insertion.ts",
    )
    const pendingChanges = []

    await assert.rejects(
      runStructuralInsertion({
        create: async () => {
          throw new Error("create failed")
        },
        insert: () => assert.fail("failed creations must not insert"),
        onPendingChange: (pending) => pendingChanges.push(pending),
      }),
      /create failed/,
    )
    assert.deepEqual(pendingChanges, [true, false])
  })
}
