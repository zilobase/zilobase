import type { Editor } from "@tiptap/react"
import { GripVertical, Plus } from "lucide-react"

import {
  SlashCommandMenu,
  slashCommandItems,
} from "@/packages/editor/extensions/slash-command"

import { insertBlockFromPlus } from "./block-insert"
import type { DragHandleTarget } from "./types"

const blockCommandItems = slashCommandItems.filter(
  (item) => item.title !== "Emoji"
)

export const dragHandleComputePositionConfig = {
  placement: "right-start",
  strategy: "absolute",
} as const

export function DragBlockMenu({
  editor,
  isOpen,
  target,
  onOpenChange,
}: {
  editor: Editor
  isOpen: boolean
  target: DragHandleTarget | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <button
        aria-label="Add block below"
        className="drag-handle-plus"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onOpenChange(!isOpen)
        }}
        onDragStart={(event) => event.preventDefault()}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        title="Add block"
        type="button"
      >
        <Plus />
      </button>
      <span className="drag-handle-grip">
        <GripVertical />
      </span>
      {isOpen && target ? (
        <div
          className="plus-block-menu slash-menu-shell"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          <SlashCommandMenu
            items={blockCommandItems}
            selectedIndex={0}
            setSelectedIndex={() => undefined}
            selectItem={(index) => {
              const item = blockCommandItems[index]

              if (!item) {
                return
              }

              insertBlockFromPlus(editor, target, item)
              onOpenChange(false)
            }}
          />
        </div>
      ) : null}
    </>
  )
}
