import { BubbleMenu } from "@tiptap/react/menus"
import { AllSelection, NodeSelection } from "@tiptap/pm/state"
import { useEffect } from "react"

import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/shared/ui/button-group"

import { blockSelectionPluginKey } from "@/packages/editor/extensions/block-selection"

import { ColorMenu } from "../components/editor/color-menu"
import { SelectionAiMenu } from "./selection-ai-menu"
import { toolbarGroups } from "../components/editor/toolbar-data"
import { ToolbarButton } from "../components/editor/toolbar-button"
import type { SelectionAiDiffPreview } from "@/packages/editor/core/types"
import type {
  EditorControlProps,
  RunToolbarCommand,
} from "../components/editor/types"

const SELECTION_BUBBLE_MENU_PLUGIN_KEY = "selectionBubbleMenu"

export function SelectionBubbleMenu({
  editor,
  onSelectionAiPreviewChange,
  workspaceId,
  runCommand,
}: EditorControlProps & {
  onSelectionAiPreviewChange: (preview: SelectionAiDiffPreview | null) => void
  workspaceId?: string | null
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

    // The editor can move while page/side-pane width transitions settle without
    // causing a window resize. Keep the selection anchor live through reflow.
    const resizeObserver = new ResizeObserver(updatePosition)
    let layoutElement: HTMLElement | null = editor.view.dom

    while (layoutElement && layoutElement !== document.body) {
      resizeObserver.observe(layoutElement)
      layoutElement = layoutElement.parentElement
    }

    editor.on("selectionUpdate", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    window.visualViewport?.addEventListener("scroll", updatePosition)
    window.visualViewport?.addEventListener("resize", updatePosition)
    updatePosition()

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }

      resizeObserver.disconnect()
      editor.off("selectionUpdate", updatePosition)
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
      shouldShow={({ editor, state, from, to }) => {
        const { selection } = state
        const blockSelectionMode =
          blockSelectionPluginKey.getState(state)?.mode ?? "none"

        return (
          editor.isEditable &&
          !editor.view.dom.classList.contains("dragging") &&
          blockSelectionMode !== "all" &&
          !(selection instanceof AllSelection) &&
          !(selection instanceof NodeSelection) &&
          !selection.empty &&
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
        <SelectionAiMenu
          editor={editor}
          onPreviewChange={onSelectionAiPreviewChange}
          workspaceId={workspaceId}
        />
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
