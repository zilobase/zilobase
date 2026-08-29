import type { Editor } from "@tiptap/react"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Icon } from "@/shared/components/icons"

export type ToolbarAction =
  | "toggleBold"
  | "toggleItalic"
  | "toggleStrike"
  | "toggleCode"
  | "toggleUnderline"
  | "toggleHeading"
  | "toggleBulletList"
  | "toggleOrderedList"
  | "toggleTaskList"
  | "toggleBlockquote"
  | "toggleCodeBlock"
  | "setDetails"
  | "setHorizontalRule"
  | "insertTable"
  | "setTextAlign"

export type ToolbarAttrs = {
  level?: 1 | 2 | 3
  align?: "left" | "center" | "right"
}

export type ToolbarItem = {
  label: string
  icon: Icon
  isActive: () => string | Record<string, unknown>
  action: ToolbarAction
  attrs?: ToolbarAttrs
}

export type { ColorToken } from "@/shared/lib/color-tokens"

export type DragHandleTarget = {
  node: ProseMirrorNode
  pos: number
}

export type RunToolbarCommand = (
  action: ToolbarAction,
  attrs?: ToolbarAttrs
) => void

export type EditorControlProps = {
  editor: Editor | null
}
