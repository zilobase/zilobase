import type { Content } from "@tiptap/core"
import type { Editor } from "@tiptap/react"

import type { SlashCommandItem } from "@/packages/editor/extensions/slash-command"

import type { DragHandleTarget } from "./types"

function blockContentForItem(item: SlashCommandItem): Content {
  switch (item.title) {
    case "Text":
      return { type: "paragraph" }
    case "Heading 1":
      return { type: "heading", attrs: { level: 1 } }
    case "Heading 2":
      return { type: "heading", attrs: { level: 2 } }
    case "Bullet List":
      return {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      }
    case "Numbered List":
      return {
        type: "orderedList",
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      }
    case "Task List":
      return {
        type: "taskList",
        content: [{ type: "taskItem", content: [{ type: "paragraph" }] }],
      }
    case "Quote":
      return {
        type: "blockquote",
        content: [{ type: "paragraph" }],
      }
    case "Code Block":
      return { type: "codeBlock" }
    case "Image":
      return { type: "imageBlock" }
    case "Video":
      return { type: "videoBlock" }
    case "File":
      return { type: "fileBlock" }
    case "Bookmark":
      return { type: "bookmarkBlock" }
    case "Toggle":
      return {
        type: "details",
        content: [
          {
            type: "detailsSummary",
            content: [{ type: "text", text: "Toggle" }],
          },
          {
            type: "detailsContent",
            content: [{ type: "paragraph" }],
          },
        ],
      }
    case "Divider":
      return [{ type: "horizontalRule" }, { type: "paragraph" }]
    case "Table":
      return {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: Array.from({ length: 3 }, () => ({
              type: "tableHeader",
              content: [{ type: "paragraph" }],
            })),
          },
          ...Array.from({ length: 2 }, () => ({
            type: "tableRow",
            content: Array.from({ length: 3 }, () => ({
              type: "tableCell",
              content: [{ type: "paragraph" }],
            })),
          })),
        ],
      }
    default:
      return { type: "paragraph" }
  }
}

function selectInsertedBlock(editor: Editor, pos: number, item: SlashCommandItem) {
  if (item.title === "Divider") {
    editor.chain().focus().setTextSelection(pos + 2).run()
    return
  }

  editor.chain().focus().setTextSelection(pos + 1).run()
}

export function insertBlockFromPlus(
  editor: Editor,
  target: DragHandleTarget,
  item: SlashCommandItem
) {
  const isEmptyTextBlock = target.node.isTextblock && target.node.content.size === 0
  const content = blockContentForItem(item)

  if (isEmptyTextBlock) {
    editor
      .chain()
      .focus()
      .deleteRange({ from: target.pos, to: target.pos + target.node.nodeSize })
      .insertContentAt(target.pos, content)
      .run()
    selectInsertedBlock(editor, target.pos, item)
    return
  }

  const insertPos = target.pos + target.node.nodeSize

  editor.chain().focus().insertContentAt(insertPos, content).run()
  selectInsertedBlock(editor, insertPos, item)
}
