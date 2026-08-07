export function register({ assert, loadModule, test }) {
  test("block drag insert pos picks before or after block midpoint", async () => {
    const { resolveBlockInsertPos } = await loadModule(
      "/src/editor/components/editor/block-drag.ts"
    )

    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 110), 10)
    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 130), 14)
    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 119), 10)
  })

  test("database block drag image keeps the block anchored when dragging from the handle", async () => {
    const { getDatabaseBlockDragImagePlacement } = await loadModule(
      "/src/editor/components/editor/block-drag.ts"
    )

    assert.deepEqual(getDatabaseBlockDragImagePlacement(700, 120, 744, 100), {
      offsetX: 0,
      offsetY: 20,
      paddingLeft: 44,
    })
  })

  test("database block drag image tracks the pointer inside the block", async () => {
    const { getDatabaseBlockDragImagePlacement } = await loadModule(
      "/src/editor/components/editor/block-drag.ts"
    )

    assert.deepEqual(getDatabaseBlockDragImagePlacement(760, 148, 744, 100), {
      offsetX: 16,
      offsetY: 48,
      paddingLeft: 0,
    })
  })

  test("block drag payload parser rejects malformed payloads", async () => {
    const {
      EDITOR_BLOCK_DRAG_MIME,
      getDraggedEditorBlockPayload,
    } = await loadModule("/src/editor/components/editor/block-drag.ts")

    const dataTransfer = {
      getData: (type) =>
        type === EDITOR_BLOCK_DRAG_MIME
          ? JSON.stringify({
              editorId: "editor-1",
              node: { type: "paragraph" },
              pos: "not-a-number",
              textContent: "",
              typeName: "paragraph",
            })
          : "",
    }

    assert.equal(getDraggedEditorBlockPayload(dataTransfer), null)
  })

  test("block drag payload parser accepts valid payloads", async () => {
    const {
      EDITOR_BLOCK_DRAG_MIME,
      getDraggedEditorBlockPayload,
    } = await loadModule("/src/editor/components/editor/block-drag.ts")
    const payload = {
      editorId: "editor-1",
      node: { type: "paragraph" },
      pos: 4,
      textContent: "Hello",
      typeName: "paragraph",
    }
    const dataTransfer = {
      getData: (type) =>
        type === EDITOR_BLOCK_DRAG_MIME ? JSON.stringify(payload) : "",
    }

    assert.deepEqual(getDraggedEditorBlockPayload(dataTransfer), payload)
  })

  test("block drag session bridges browsers that hide custom transfer data", async () => {
    const {
      armBlockDrag,
      endBlockDrag,
      getDraggedEditorBlockPayload,
    } = await loadModule("/src/editor/components/editor/block-drag.ts")
    const target = {
      node: {
        textContent: "Hello",
        toJSON: () => ({ type: "paragraph" }),
        type: { name: "paragraph" },
      },
      pos: 4,
    }

    armBlockDrag("editor-1", target)

    assert.deepEqual(getDraggedEditorBlockPayload(null), {
      editorId: "editor-1",
      node: { type: "paragraph" },
      pos: 4,
      textContent: "Hello",
      typeName: "paragraph",
    })

    endBlockDrag()
    assert.equal(getDraggedEditorBlockPayload(null), null)
  })

  test("database block drags expose their source database id", async () => {
    const { canMoveDatabaseBlockToPage, getBlockDragDatabaseId } =
      await loadModule("/src/editor/components/editor/block-drag.ts")
    const payload = {
      editorId: "editor-1",
      node: {
        attrs: { databaseId: "tasks" },
        type: "databaseBlock",
      },
      pos: 4,
      textContent: "",
      typeName: "databaseBlock",
    }

    assert.equal(getBlockDragDatabaseId(payload), "tasks")
    assert.equal(
      getBlockDragDatabaseId({ ...payload, node: { type: "databaseBlock" } }),
      null
    )
    assert.equal(
      getBlockDragDatabaseId({ ...payload, typeName: "paragraph" }),
      null
    )
    assert.equal(
      canMoveDatabaseBlockToPage("tasks", "tasks", ["tasks"]),
      false
    )
    assert.equal(
      canMoveDatabaseBlockToPage("tasks", null, ["tasks"]),
      false
    )
    assert.equal(
      canMoveDatabaseBlockToPage("tasks", "projects", ["projects"]),
      true
    )
  })

  test("cross-editor database drops copy or move the source block", async () => {
    const { dropCrossEditorBlock, registerBlockDragSource } = await loadModule(
      "/src/editor/components/editor/block-drag.ts"
    )
    const payload = {
      editorId: "source-editor",
      node: {
        attrs: { databaseId: "tasks" },
        type: "databaseBlock",
      },
      pos: 2,
      textContent: "",
      typeName: "databaseBlock",
    }
    const source = fakeEditorView()
    const firstTarget = fakeEditorView()
    const unregister = registerBlockDragSource("source-editor", {
      view: source.view,
    })

    assert.equal(
      dropCrossEditorBlock(firstTarget.view, payload, 5, "copy"),
      true
    )
    assert.equal(firstTarget.dispatches.length, 1)
    assert.equal(source.dispatches.length, 0)

    const secondTarget = fakeEditorView()
    assert.equal(
      dropCrossEditorBlock(secondTarget.view, payload, 5, "move"),
      true
    )
    assert.equal(secondTarget.dispatches.length, 1)
    assert.equal(source.dispatches.length, 1)

    unregister()
  })
}

function fakeEditorView() {
  const dispatches = []
  const node = {
    marks: [],
    nodeSize: 1,
    sameMarkup: () => true,
    textContent: "",
    type: { name: "databaseBlock" },
  }
  const transaction = {
    delete() {
      return transaction
    },
    insert() {
      return transaction
    },
    scrollIntoView() {
      return transaction
    },
  }
  const view = {
    dispatch(value) {
      dispatches.push(value)
    },
    dom: { classList: { remove() {} } },
    focus() {},
    state: {
      doc: {
        nodeAt: () => node,
        resolve: () => ({
          depth: 0,
          index: () => 0,
          node: () => ({ canReplaceWith: () => true }),
        }),
      },
      schema: { nodeFromJSON: () => node },
      tr: transaction,
    },
  }

  return { dispatches, view }
}
