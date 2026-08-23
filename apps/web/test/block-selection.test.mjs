export function register({ assert, loadModule, test }) {
  test("block selection allows only non-mutating keyboard actions", async () => {
    const { shouldBlockBlockSelectionKeydown } = await loadModule(
      "/src/editor/extensions/block-selection.ts"
    )
    const keyEvent = (key, overrides = {}) => ({
      altKey: false,
      ctrlKey: false,
      key,
      metaKey: false,
      ...overrides,
    })

    assert.equal(
      shouldBlockBlockSelectionKeydown(keyEvent("c", { metaKey: true })),
      false,
    )
    assert.equal(
      shouldBlockBlockSelectionKeydown(keyEvent("a", { metaKey: true })),
      false,
    )
    assert.equal(shouldBlockBlockSelectionKeydown(keyEvent("Escape")), false)
    assert.equal(shouldBlockBlockSelectionKeydown(keyEvent("ArrowLeft")), false)
    assert.equal(shouldBlockBlockSelectionKeydown(keyEvent("a")), true)
    assert.equal(shouldBlockBlockSelectionKeydown(keyEvent("Enter")), true)
    assert.equal(shouldBlockBlockSelectionKeydown(keyEvent("Backspace")), true)
    assert.equal(
      shouldBlockBlockSelectionKeydown(keyEvent("v", { metaKey: true })),
      true,
    )
    assert.equal(
      shouldBlockBlockSelectionKeydown(keyEvent("x", { metaKey: true })),
      true,
    )
    assert.equal(
      shouldBlockBlockSelectionKeydown(keyEvent("b", { metaKey: true })),
      true,
    )
  })

  test("block selection includes a leading atom database block", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { getBlockSelectionRanges } = await loadModule(
      "/src/editor/extensions/block-selection.ts"
    )
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: { group: "inline" },
        paragraph: {
          content: "inline*",
          group: "block",
          toDOM: () => ["p", 0],
        },
        databaseBlock: {
          atom: true,
          group: "block",
          selectable: true,
          toDOM: () => ["div", { "data-type": "databaseBlock" }],
        },
      },
      marks: {},
    })
    const doc = schema.node("doc", null, [
      schema.node("databaseBlock"),
      schema.node("paragraph", null, schema.text("After")),
    ])

    assert.deepEqual(
      getBlockSelectionRanges(doc, 0, doc.content.size),
      [
        { from: 0, to: 1 },
        { from: 1, to: 8 },
      ]
    )
  })

  test("block selection treats an inline meeting as one atom", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { getBlockSelectionRanges } = await loadModule(
      "/src/editor/extensions/block-selection.ts"
    )
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: { group: "inline" },
        paragraph: {
          content: "inline*",
          group: "block",
          toDOM: () => ["p", 0],
        },
        meetingBlock: {
          atom: true,
          group: "block",
          selectable: true,
          toDOM: () => ["div", { "data-type": "meetingBlock" }],
        },
      },
      marks: {},
    })
    const doc = schema.node("doc", null, [
      schema.node("meetingBlock"),
      schema.node("paragraph", null, schema.text("After")),
    ])

    assert.deepEqual(
      getBlockSelectionRanges(doc, 0, doc.content.size),
      [
        { from: 0, to: 1 },
        { from: 1, to: 8 },
      ]
    )
  })

  test("selected task items are resolved as one multi-block action range", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { AllSelection, EditorState } = await import("@tiptap/pm/state")
    const {
      buildAllBlockDecorations,
      getSelectedBlockRangesForTarget,
      getSelectedTaskItemPositions,
    } = await loadModule("/src/editor/extensions/block-selection.ts")
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: { group: "inline" },
        paragraph: {
          content: "inline*",
          group: "block",
          toDOM: () => ["p", 0],
        },
        taskList: {
          content: "taskItem+",
          group: "block",
          toDOM: () => ["ul", { "data-type": "taskList" }, 0],
        },
        taskItem: {
          attrs: { checked: { default: false } },
          content: "paragraph+",
          defining: true,
          toDOM: (node) => [
            "li",
            {
              "data-checked": String(node.attrs.checked),
              "data-type": "taskItem",
            },
            0,
          ],
        },
      },
      marks: {},
    })
    const task = (text) =>
      schema.node("taskItem", null, [
        schema.node("paragraph", null, schema.text(text)),
      ])
    const doc = schema.node("doc", null, [
      schema.node("taskList", null, [
        task("First"),
        task("Second"),
        task("Third"),
      ]),
      schema.node("paragraph", null, schema.text("After")),
    ])
    const taskPositions = []
    doc.descendants((node, pos) => {
      if (node.type.name === "taskItem") taskPositions.push(pos)
    })
    const selectionFrom = taskPositions[0] + 2
    const lastTask = doc.nodeAt(taskPositions[2])
    const selectionTo = taskPositions[2] + lastTask.nodeSize - 2

    assert.deepEqual(
      getSelectedTaskItemPositions(
        doc,
        selectionFrom,
        selectionTo,
        taskPositions[1],
      ),
      taskPositions,
    )
    assert.deepEqual(
      getSelectedBlockRangesForTarget(
        doc,
        selectionFrom,
        selectionTo,
        doc.content.size - 1,
      ),
      [],
    )

    const transaction = EditorState.create({
      doc,
      selection: new AllSelection(doc),
    }).tr

    taskPositions.forEach((taskItemPos) => {
      const taskItem = transaction.doc.nodeAt(taskItemPos)

      transaction.setNodeMarkup(taskItemPos, undefined, {
        ...taskItem.attrs,
        checked: true,
      })
    })

    const decorations = buildAllBlockDecorations(
      transaction.doc,
      transaction.selection,
    ).find()

    assert.deepEqual(
      decorations
        .filter((decoration) =>
          taskPositions.includes(decoration.from)
        )
        .map((decoration) => decoration.from),
      taskPositions,
    )
  })
}
