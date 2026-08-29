import type { Editor as TiptapEditor } from "@tiptap/react"
import type {
  ToolbarAction,
  ToolbarAttrs,
} from "@/packages/editor/components/editor/types"

const toolbarCommands: Record<
  ToolbarAction,
  (chain: ReturnType<TiptapEditor["chain"]>, attrs?: ToolbarAttrs) => void
> = {
  toggleBold: (chain) => chain.toggleBold().run(),
  toggleItalic: (chain) => chain.toggleItalic().run(),
  toggleStrike: (chain) => chain.toggleStrike().run(),
  toggleCode: (chain) => chain.toggleCode().run(),
  toggleUnderline: (chain) => chain.toggleUnderline().run(),
  toggleHeading: (chain, attrs) =>
    chain.toggleHeading({ level: attrs?.level ?? 1 }).run(),
  toggleBulletList: (chain) => chain.toggleBulletList().run(),
  toggleOrderedList: (chain) => chain.toggleOrderedList().run(),
  toggleTaskList: (chain) => chain.toggleTaskList().run(),
  toggleBlockquote: (chain) => chain.toggleBlockquote().run(),
  toggleCodeBlock: (chain) => chain.toggleCodeBlock().run(),
  setDetails: (chain) => chain.setDetails().run(),
  setHorizontalRule: (chain) => chain.setHorizontalRule().run(),
  insertTable: (chain) =>
    chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  setTextAlign: (chain, attrs) =>
    chain.setTextAlign(attrs?.align ?? "left").run(),
}

export const runToolbarCommand = (
  editor: TiptapEditor | null,
  action: ToolbarAction,
  attrs?: ToolbarAttrs
) => {
  if (!editor) return
  toolbarCommands[action](editor.chain().focus(), attrs)
}