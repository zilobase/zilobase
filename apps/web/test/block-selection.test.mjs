export function register({ assert, loadModule, test }) {
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
}
