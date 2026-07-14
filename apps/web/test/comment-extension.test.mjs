import { fileURLToPath } from "node:url"

export function register({ assert, loadModule, test }) {
  test("comment selection lookup returns existing thread ids", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { EditorState, TextSelection } = await import("@tiptap/pm/state")
    const extensionPath = fileURLToPath(
      new URL("../../../packages/tiptap-comment-extension/src/index.ts", import.meta.url),
    )
    const { getCommentIdsAtSelection } = await loadModule(extensionPath)
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        paragraph: { content: "inline*", group: "block" },
        text: { group: "inline" },
      },
      marks: {
        comment: { attrs: { commentId: {} } },
      },
    })
    const firstMark = schema.mark("comment", { commentId: "thread-one" })
    const secondMark = schema.mark("comment", { commentId: "thread-two" })
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("first", [firstMark]),
        schema.text(" second", [secondMark]),
      ]),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 13),
    })

    assert.deepEqual(
      getCommentIdsAtSelection({ schema, state }),
      ["thread-one", "thread-two"],
    )
  })

  test("comment selection lookup ignores unmarked text", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { EditorState, TextSelection } = await import("@tiptap/pm/state")
    const extensionPath = fileURLToPath(
      new URL("../../../packages/tiptap-comment-extension/src/index.ts", import.meta.url),
    )
    const { getCommentIdsAtSelection } = await loadModule(extensionPath)
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        paragraph: { content: "inline*", group: "block" },
        text: { group: "inline" },
      },
      marks: {
        comment: { attrs: { commentId: {} } },
      },
    })
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("plain text")),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 6),
    })

    assert.deepEqual(getCommentIdsAtSelection({ schema, state }), [])
  })
}
