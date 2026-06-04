import { BubbleMenu } from "@tiptap/react/menus"
import { useEffect } from "react"

import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group"

import { ColorMenu } from "./color-menu"
import { toolbarGroups } from "./toolbar-data"
import { ToolbarButton } from "./toolbar-button"
import type { EditorControlProps, RunToolbarCommand } from "./types"

const SELECTION_BUBBLE_MENU_PLUGIN_KEY = "selectionBubbleMenu"

export function SelectionBubbleMenu({
  editor,
  runCommand,
}: EditorControlProps & {
  runCommand: RunToolbarCommand
}) {
  useEffect(() => {
    if (!editor) {
      return
    }

    let frame: number | null = null

    const updatePosition = () => {
      if (frame !== null) {
        return
      }

      frame = window.requestAnimationFrame(() => {
        frame = null

        if (editor.isDestroyed) {
          return
        }

        editor.view.dispatch(
          editor.state.tr.setMeta(
            SELECTION_BUBBLE_MENU_PLUGIN_KEY,
            "updatePosition",
          ),
        )
      })
    }

    window.addEventListener("scroll", updatePosition, true)
    window.visualViewport?.addEventListener("scroll", updatePosition)
    window.visualViewport?.addEventListener("resize", updatePosition)

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }

      window.removeEventListener("scroll", updatePosition, true)
      window.visualViewport?.removeEventListener("scroll", updatePosition)
      window.visualViewport?.removeEventListener("resize", updatePosition)
    }
  }, [editor])

  if (!editor) {
    return null
  }

  return (
    <BubbleMenu
      className="selection-toolbar-layer"
      editor={editor}
      pluginKey={SELECTION_BUBBLE_MENU_PLUGIN_KEY}
      resizeDelay={0}
      updateDelay={0}
      options={{
        placement: "top",
        offset: 8,
        strategy: "fixed",
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
