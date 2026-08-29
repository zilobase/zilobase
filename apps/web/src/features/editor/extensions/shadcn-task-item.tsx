import TaskItem from "@tiptap/extension-task-item"
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"

import { Checkbox } from "@/shared/ui/checkbox"
import { getSelectedTaskItemPositions } from "./block-selection"

type ShadcnTaskItemOptions = {
  editable: boolean
  nested: boolean
}

function ShadcnTaskItemView({
  editor,
  extension,
  getPos,
  node,
  updateAttributes,
}: NodeViewProps) {
  const checked = Boolean(node.attrs.checked)
  const options = extension.options as { editable?: boolean }
  const isEditable = options.editable !== false && editor.isEditable

  return (
    <NodeViewWrapper
      as="li"
      data-checked={checked}
      data-type="taskItem"
      className="task-item"
    >
      <span className="task-item-checkbox" contentEditable={false}>
        <Checkbox
          aria-label={`Task item: ${node.textContent || "empty task item"}`}
          checked={checked}
          disabled={!isEditable}
          onCheckedChange={(nextChecked) => {
            if (!isEditable) {
              return
            }

            const checked = nextChecked === true
            const pos = getPos()
            const { doc, selection } = editor.state
            const selectedTaskItemPositions =
              typeof pos === "number"
                ? getSelectedTaskItemPositions(
                    doc,
                    selection.from,
                    selection.to,
                    pos,
                  )
                : []

            if (selectedTaskItemPositions.length > 1) {
              const transaction = editor.state.tr

              selectedTaskItemPositions.forEach((taskItemPos) => {
                const taskItem = doc.nodeAt(taskItemPos)

                if (taskItem?.type.name === "taskItem") {
                  transaction.setNodeMarkup(taskItemPos, undefined, {
                    ...taskItem.attrs,
                    checked,
                  })
                }
              })

              editor.view.dispatch(transaction)
              return
            }

            updateAttributes({ checked })
          }}
          onMouseDown={(event) => event.preventDefault()}
        />
      </span>
      <NodeViewContent as="div" className="task-item-content" />
    </NodeViewWrapper>
  )
}

export const ShadcnTaskItem = TaskItem.extend<ShadcnTaskItemOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      editable: true,
      nested: false,
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ShadcnTaskItemView)
  },
})
