import { Extension } from "@tiptap/core"
import { Plugin, type EditorState, type Transaction } from "@tiptap/pm/state"
import type { Fragment, Node } from "@tiptap/pm/model"

export const OfflineStructureGuard = Extension.create({
  name: "offlineStructureGuard",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(transaction, state) {
          return allowsOfflineTransaction(transaction, state)
        },
      }),
    ]
  },
})

export function allowsOfflineTransaction(
  transaction: Transaction,
  state: EditorState,
) {
  if (!transaction.docChanged) return true
  return !transaction.steps.some((step) => {
    const candidate = step as unknown as {
      from?: number
      slice?: { content?: Fragment }
      to?: number
    }
    let touchesExisting = false
    if (typeof candidate.from === "number" && typeof candidate.to === "number") {
      state.doc.nodesBetween(candidate.from, candidate.to, (node) => {
        if (isProtectedStructuralNode(node)) touchesExisting = true
      })
    }
    let addsStructural = false
    candidate.slice?.content?.descendants((node) => {
      if (isProtectedStructuralNode(node)) addsStructural = true
    })
    return touchesExisting || addsStructural
  })
}

function isProtectedStructuralNode(node: Node) {
  return [
    "askAiBlock",
    "bookmarkBlock",
    "databaseBlock",
    "embedBlock",
    "fileBlock",
    "imageBlock",
    "meetingBlock",
    "pageBlock",
    "videoBlock",
  ].includes(node.type.name)
}
