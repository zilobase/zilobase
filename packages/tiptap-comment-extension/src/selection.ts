import type { Editor } from "@tiptap/core"
import type { Mark } from "@tiptap/pm/model"

function readThreadId(mark: Mark, commentMark: Mark["type"]) {
  if (mark.type !== commentMark) return null
  const value = mark.attrs.commentId
  return typeof value === "string" && value.length > 0 ? value : null
}

export function getCommentIdsAtSelection(editor: Editor): string[] {
  const commentMark = editor.schema.marks.comment
  if (!commentMark) return []

  const { doc, selection } = editor.state
  const threadIds = new Set<string>()
  const collect = (marks: readonly Mark[]) => {
    for (const mark of marks) {
      const threadId = readThreadId(mark, commentMark)
      if (threadId) threadIds.add(threadId)
    }
  }

  if (selection.empty) {
    collect(selection.$from.marks())
  } else {
    doc.nodesBetween(selection.from, selection.to, (node) => collect(node.marks))
  }

  return [...threadIds]
}
