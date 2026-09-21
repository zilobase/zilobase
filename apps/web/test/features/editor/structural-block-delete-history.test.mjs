export function register({ assert, loadModule, readSource, test }) {
  const flush = () => new Promise((resolve) => setImmediate(resolve))

  test("structural delete undo restores the editor node and resource together", async () => {
    const { createStructuralBlockDeleteHistoryAction } = await loadModule(
      "/src/features/editor/drag-drop/structural-block-delete-history.ts",
    )
    const events = []
    const action = createStructuralBlockDeleteHistoryAction({
      editor: {
        redo: () => events.push("editor:redo"),
        undo: () => events.push("editor:undo"),
      },
      onError: (error) => assert.fail(error),
      resource: {
        redo: async () => events.push("resource:redo"),
        undo: async () => events.push("resource:undo"),
      },
    })

    action.undo()
    await flush()
    action.redo()
    await flush()

    assert.deepEqual(events, [
      "editor:undo",
      "resource:undo",
      "editor:redo",
      "resource:redo",
    ])
  })

  test("structural resource transitions stay ordered across rapid undo and redo", async () => {
    const { createStructuralBlockDeleteHistoryAction } = await loadModule(
      "/src/features/editor/drag-drop/structural-block-delete-history.ts",
    )
    const events = []
    let finishRestore
    const restorePending = new Promise((resolve) => {
      finishRestore = resolve
    })
    const action = createStructuralBlockDeleteHistoryAction({
      editor: {
        redo: () => events.push("editor:redo"),
        undo: () => events.push("editor:undo"),
      },
      onError: (error) => assert.fail(error),
      resource: {
        redo: async () => events.push("resource:redo"),
        undo: async () => {
          events.push("resource:undo:start")
          await restorePending
          events.push("resource:undo:end")
        },
      },
    })

    action.undo()
    action.redo()
    await flush()
    assert.deepEqual(events, [
      "editor:undo",
      "editor:redo",
      "resource:undo:start",
    ])

    finishRestore()
    await flush()
    assert.deepEqual(events, [
      "editor:undo",
      "editor:redo",
      "resource:undo:start",
      "resource:undo:end",
      "resource:redo",
    ])
  })

  test("failed editor history commands do not mutate the resource", async () => {
    const { createStructuralBlockDeleteHistoryAction } = await loadModule(
      "/src/features/editor/drag-drop/structural-block-delete-history.ts",
    )
    const events = []
    const action = createStructuralBlockDeleteHistoryAction({
      editor: {
        redo: () => false,
        undo: () => false,
      },
      onError: (error) => assert.fail(error),
      resource: {
        redo: async () => events.push("resource:redo"),
        undo: async () => events.push("resource:undo"),
      },
    })

    assert.equal(action.undo(), false)
    assert.equal(action.redo(), false)
    await flush()
    assert.deepEqual(events, [])
  })

  test("database deletion wires resource restoration into one editor history action", async () => {
    const [menu, pane, types] = await Promise.all([
      readSource("/src/features/editor/drag-drop/drag-block-menu.tsx"),
      readSource("/src/features/pages/pane/page-editor-pane.tsx"),
      readSource("/src/features/editor/core/types.ts"),
    ])

    assert.match(types, /Promise<StructuralBlockDeleteHistory \| void>/)
    assert.match(menu, /undoHistory\.runWithoutRecording\(deleteEditorBlock\)/)
    assert.match(menu, /createStructuralBlockDeleteHistoryAction/)
    assert.match(pane, /await restoreDatabase\.mutateAsync\(request\.id\)/)
    assert.match(pane, /await embedPageItem\.mutateAsync\(input\)/)
  })
}
