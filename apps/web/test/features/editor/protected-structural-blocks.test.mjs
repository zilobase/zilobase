export function register({ assert, loadModule, test }) {
  test("Backspace from an empty line after a database resolves the database title", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { EditorState, TextSelection } = await import("@tiptap/pm/state")
    const { getProtectedStructuralBlockForDelete } = await loadModule(
      "/src/editor/protected-structural-blocks.ts",
    )
    const schema = createSchema(Schema)
    const doc = schema.node("doc", null, [
      schema.node("databaseBlock", { databaseId: "database-1" }),
      schema.node("paragraph"),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    })

    const target = getProtectedStructuralBlockForDelete(state)

    assert.equal(target?.pos, 0)
    assert.equal(target?.type, "databaseBlock")
  })

  test("Delete and Backspace protect a selected meeting block", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { EditorState, NodeSelection } = await import("@tiptap/pm/state")
    const { getProtectedStructuralBlockForDelete } = await loadModule(
      "/src/editor/protected-structural-blocks.ts",
    )
    const schema = createSchema(Schema)
    const doc = schema.node("doc", null, [
      schema.node("meetingBlock", { meetingId: "meeting-1" }),
      schema.node("paragraph"),
    ])
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    })

    assert.equal(getProtectedStructuralBlockForDelete(state)?.type, "meetingBlock")
  })

  test("normal text blocks keep native Backspace behavior", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { EditorState, TextSelection } = await import("@tiptap/pm/state")
    const { getProtectedStructuralBlockForDelete } = await loadModule(
      "/src/editor/protected-structural-blocks.ts",
    )
    const schema = createSchema(Schema)
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("Before")),
      schema.node("paragraph"),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 9),
    })

    assert.equal(getProtectedStructuralBlockForDelete(state), null)
  })

  test("modified character shortcuts do not replace a structural selection", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { AllSelection, EditorState } = await import("@tiptap/pm/state")
    const { handleProtectedStructuralBlockDeleteKey } = await loadModule(
      "/src/editor/protected-structural-blocks.ts",
    )
    const schema = createSchema(Schema)
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("Before")),
      schema.node("databaseBlock", { databaseId: "database-1" }),
    ])
    const state = EditorState.create({
      doc,
      selection: new AllSelection(doc),
    })
    const event = {
      altKey: false,
      ctrlKey: false,
      key: "a",
      metaKey: true,
      preventDefault() {
        throw new Error("Cmd+A must reach the editor shortcut handler")
      },
    }

    assert.equal(
      handleProtectedStructuralBlockDeleteKey({ state }, event),
      false,
    )
  })
}

function createSchema(Schema) {
  return new Schema({
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
        attrs: { databaseId: { default: null }, showTitle: { default: true } },
        group: "block",
        selectable: true,
        toDOM: () => ["div", { "data-type": "databaseBlock" }],
      },
      meetingBlock: {
        atom: true,
        attrs: { meetingId: { default: null } },
        group: "block",
        selectable: true,
        toDOM: () => ["div", { "data-type": "meetingBlock" }],
      },
    },
    marks: {},
  })
}
