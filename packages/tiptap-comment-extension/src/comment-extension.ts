import { Mark, mergeAttributes, type Range } from "@tiptap/core"
import type { Mark as ProseMirrorMark } from "@tiptap/pm/model"

import { getCommentIdsAtSelection } from "./selection"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comment: {
      setComment: (threadId: string) => ReturnType
      unsetComment: (threadId: string) => ReturnType
    }
  }
}

export type CommentOptions = {
  HTMLAttributes: Record<string, unknown>
  onCommentActivated: (threadId: string | null) => void
}

export type CommentStorage = {
  activeThreadId: string | null
}

type AnchoredMark = {
  mark: ProseMirrorMark
  range: Range
}

export const CommentExtension = Mark.create<CommentOptions, CommentStorage>({
  name: "comment",

  addOptions() {
    return {
      HTMLAttributes: {},
      onCommentActivated: () => undefined,
    }
  },

  addStorage() {
    return { activeThreadId: null }
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.dataset.commentId ?? null,
        renderHTML: ({ commentId }) =>
          typeof commentId === "string" && commentId.length > 0
            ? { "data-comment-id": commentId }
            : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  onSelectionUpdate() {
    const activeThreadId = getCommentIdsAtSelection(this.editor)[0] ?? null
    if (activeThreadId === this.storage.activeThreadId) return

    this.storage.activeThreadId = activeThreadId
    this.options.onCommentActivated(activeThreadId)
  },

  addCommands() {
    return {
      setComment:
        (threadId) =>
        ({ commands }) => {
          if (!threadId) return false
          return commands.setMark(this.name, { commentId: threadId })
        },
      unsetComment:
        (threadId) =>
        ({ dispatch, tr }) => {
          if (!threadId) return false

          const anchors: AnchoredMark[] = []
          tr.doc.descendants((node, position) => {
            for (const mark of node.marks) {
              if (mark.type.name !== this.name || mark.attrs.commentId !== threadId) continue
              anchors.push({
                mark,
                range: { from: position, to: position + node.nodeSize },
              })
              break
            }
          })
          if (anchors.length === 0) return false

          if (dispatch) {
            for (const anchor of anchors) {
              tr.removeMark(anchor.range.from, anchor.range.to, anchor.mark)
            }
            dispatch(tr)
          }
          return true
        },
    }
  },
})

export default CommentExtension
