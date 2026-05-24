import { BubbleMenu } from "@tiptap/react/menus"

import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group"

import { ColorMenu } from "./color-menu"
import { toolbarGroups } from "./toolbar-data"
import { ToolbarButton } from "./toolbar-button"
import type { EditorControlProps, RunToolbarCommand } from "./types"

export function SelectionBubbleMenu({
  editor,
  runCommand,
}: EditorControlProps & {
  runCommand: RunToolbarCommand
}) {
  if (!editor) {
    return null
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: "top",
        offset: 8,
      }}
      shouldShow={({ editor, state }) => {
        const { from, to } = state.selection

        return (
          editor.isEditable &&
          !state.selection.empty &&
          state.doc.textBetween(from, to).trim().length > 0
        )
      }}
    >
      <ButtonGroup className="selection-toolbar">
        {toolbarGroups[0].map((item) => (
          <ToolbarButton
            editor={editor}
            item={item}
            key={item.label}
            runCommand={runCommand}
            useMouseDown
          />
        ))}
        <ButtonGroupSeparator />
        <ColorMenu editor={editor} />
        <ButtonGroupSeparator />
        {toolbarGroups[2].map((item) => (
          <ToolbarButton
            editor={editor}
            item={item}
            key={item.label}
            runCommand={runCommand}
            useMouseDown
          />
        ))}
      </ButtonGroup>
    </BubbleMenu>
  )
}
