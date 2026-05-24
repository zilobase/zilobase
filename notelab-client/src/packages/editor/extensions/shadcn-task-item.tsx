import TaskItem from "@tiptap/extension-task-item"
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"

import { Checkbox } from "@/components/ui/checkbox"

function ShadcnTaskItemView({
  editor,
  node,
  updateAttributes,
}: NodeViewProps) {
  const checked = Boolean(node.attrs.checked)

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
          disabled={!editor.isEditable}
          onCheckedChange={(nextChecked) => {
            updateAttributes({ checked: nextChecked === true })
          }}
          onMouseDown={(event) => event.preventDefault()}
        />
      </span>
      <NodeViewContent as="div" className="task-item-content" />
    </NodeViewWrapper>
  )
}

export const ShadcnTaskItem = TaskItem.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ShadcnTaskItemView)
  },
})
