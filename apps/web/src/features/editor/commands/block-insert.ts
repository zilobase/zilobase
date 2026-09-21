import type { Content } from "@tiptap/core"
import type { Editor } from "@tiptap/react"

import type { SlashCommandItem } from "../extensions/slash-command"
import { createDatabaseSetupBlockContent } from "@/features/databases"

import type { DragHandleTarget } from "../toolbar/toolbar-contracts"
import {
  runStructuralInsertion,
  type StructuralInsertionPendingChange,
} from "./structural-insertion"

function getColumnCount(title: string) {
  const match = title.match(/^([2-4]) Columns$/)

  return match ? Number(match[1]) : null
}

function convertedTextBlock(
  title: string,
  node: { isTextblock: boolean; textContent: string },
): Content {
  const text =
    node.isTextblock && node.textContent.trim() ? node.textContent : "";
  const content = text ? [{ type: "text", text }] : undefined;
  if (title === "Text") return { type: "paragraph", content };
  const levels: Record<string, number> = {
    "Heading 1": 1,
    "Heading 2": 2,
    "Heading 3": 3,
  };
  return { type: "heading", attrs: { level: levels[title] ?? 3 }, content };
}

export function blockContentForConversion(
  item: SlashCommandItem,
  node: { isTextblock: boolean; textContent: string },
): Content | null {
  const content = blockContentForItem(item);
  if (!content) return null;
  if (item.title === "Text" || item.title.startsWith("Heading"))
    return convertedTextBlock(item.title, node);
  return content;
}

function blockContentForItem(
  item: SlashCommandItem,
  attrs?: { databaseId?: string; meetingId?: string }
): Content | null {
  const columnCount = getColumnCount(item.title)

  if (columnCount) {
    return {
      type: "columnBlock",
      content: Array.from({ length: columnCount }, () => ({
        type: "column",
        content: [{ type: "paragraph" }],
      })),
    }
  }

  switch (item.title) {
    case "Text":
      return { type: "paragraph" }
    case "Heading 1":
      return { type: "heading", attrs: { level: 1 } }
    case "Heading 2":
      return { type: "heading", attrs: { level: 2 } }
    case "Heading 3":
      return { type: "heading", attrs: { level: 3 } }
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
    case "Embed":
      return { type: "embedBlock" }
    case "YouTube":
      return { type: "embedBlock", attrs: { provider: "youtube" } }
    case "Figma":
      return { type: "embedBlock", attrs: { provider: "figma" } }
    case "Excalidraw":
      return { type: "embedBlock", attrs: { provider: "excalidraw" } }
    case "Miro":
      return { type: "embedBlock", attrs: { provider: "miro" } }
    case "File":
      return { type: "fileBlock" }
    case "Bookmark":
      return { type: "bookmarkBlock" }
    case "Page":
      return { type: "pageBlock" }
    case "Link to page":
      return { type: "pageBlock", attrs: { openPicker: true } }
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
    case "Database":
      return attrs?.databaseId
        ? createDatabaseSetupBlockContent(attrs.databaseId)
        : null
    case "Meeting notes":
      return attrs?.meetingId
        ? { type: "meetingBlock", attrs: { meetingId: attrs.meetingId } }
        : null
    default:
      return { type: "paragraph" }
  }
}

function selectInsertedBlock(editor: Editor, pos: number, item: SlashCommandItem) {
  if (item.title === "Database") {
    editor.chain().focus().setTextSelection(pos + 2).run()
    return
  }

  if (item.title === "Divider") {
    editor.chain().focus().setTextSelection(pos + 2).run()
    return
  }

  editor.chain().focus().setTextSelection(pos + 1).run()
}

export async function insertBlockFromPlus(
  editor: Editor,
  target: DragHandleTarget,
  item: SlashCommandItem,
  options: {
    onCreateDatabase?: () => Promise<string | null>
    onCreateMeeting?: () => Promise<string | null>
    onStructuralInsertionPendingChange?: StructuralInsertionPendingChange
  } = {},
) {
  const isEmptyTextBlock = target.node.isTextblock && target.node.content.size === 0

  const insert = (content: Content | null) => {
    if (!content) {
      return
    }

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

  if (item.title === "Database") {
    await runStructuralInsertion({
      create: options.onCreateDatabase,
      insert: (databaseId) =>
        insert(blockContentForItem(item, { databaseId })),
      onPendingChange: options.onStructuralInsertionPendingChange,
    })
    return
  }

  if (item.title === "Meeting notes") {
    await runStructuralInsertion({
      create: options.onCreateMeeting,
      insert: (meetingId) => insert(blockContentForItem(item, { meetingId })),
      onPendingChange: options.onStructuralInsertionPendingChange,
    })
    return
  }

  insert(blockContentForItem(item))
}
