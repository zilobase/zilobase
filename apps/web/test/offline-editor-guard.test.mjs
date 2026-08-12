import { Schema } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"

export function register({ assert, loadModule, test }) {
  test("offline structural guard permits text but rejects page block changes", async () => {
    const { allowsOfflineTransaction } = await loadModule(
      "/src/editor/offline-structure-guard.ts",
    )
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        paragraph: { content: "text*", group: "block" },
        pageBlock: { atom: true, group: "block" },
        databaseBlock: { atom: true, group: "block" },
        text: {},
      },
    })
    const paragraph = schema.node("paragraph", null, schema.text("hello"))
    const pageBlock = schema.node("pageBlock")
    const state = EditorState.create({
      doc: schema.node("doc", null, [paragraph, pageBlock]),
    })
    assert.equal(allowsOfflineTransaction(state.tr.insertText("!", 2), state), true)

    let pagePosition = -1
    state.doc.descendants((node, position) => {
      if (node.type.name === "pageBlock") pagePosition = position
    })
    assert.equal(
      allowsOfflineTransaction(
        state.tr.delete(pagePosition, pagePosition + pageBlock.nodeSize),
        state,
      ),
      false,
    )
    assert.equal(
      allowsOfflineTransaction(
        state.tr.insert(state.doc.content.size, schema.node("databaseBlock")),
        state,
      ),
      false,
    )
  })
}
