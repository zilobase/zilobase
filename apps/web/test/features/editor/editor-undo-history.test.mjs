export function register({ assert, loadModule, test }) {
  test("editor history records new undo groups", async () => {
    const { getEditorHistoryTransition } = await loadModule(
      "/src/app/shortcuts/editor-history.ts"
    )

    assert.deepEqual(
      getEditorHistoryTransition(
        { redo: 0, undo: 2 },
        { redo: 0, undo: 3 },
        false
      ),
      { count: 1, type: "push" }
    )
    assert.equal(
      getEditorHistoryTransition(
        { redo: 0, undo: 3 },
        { redo: 0, undo: 3 },
        false
      ),
      null
    )
  })

  test("editor history recognizes undo and redo transitions", async () => {
    const { getEditorHistoryTransition } = await loadModule(
      "/src/app/shortcuts/editor-history.ts"
    )

    assert.deepEqual(
      getEditorHistoryTransition(
        { redo: 0, undo: 3 },
        { redo: 1, undo: 2 },
        true
      ),
      { count: 1, type: "undo" }
    )
    assert.deepEqual(
      getEditorHistoryTransition(
        { redo: 1, undo: 2 },
        { redo: 0, undo: 3 },
        true
      ),
      { count: 1, type: "redo" }
    )
  })

  test("a new edit after undo is not mistaken for redo", async () => {
    const { getEditorHistoryTransition } = await loadModule(
      "/src/app/shortcuts/editor-history.ts"
    )

    assert.deepEqual(
      getEditorHistoryTransition(
        { redo: 2, undo: 1 },
        { redo: 0, undo: 2 },
        false
      ),
      { count: 1, type: "push" }
    )
  })
}
