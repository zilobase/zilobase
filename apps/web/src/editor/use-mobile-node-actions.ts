import { useCallback, useState } from "react"
import type { MouseEvent as ReactMouseEvent } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import type { DragHandleTarget } from "@/packages/editor/components/editor/types"
import { isMobileViewport } from "./dom"
import type { NodePlacement } from "./types"

const getTargetPlacement = (
  editor: TiptapEditor,
  target: DragHandleTarget
): NodePlacement | null => {
  let placement: NodePlacement | null = null
  editor.state.doc.descendants((node, pos, parent, index) => {
    if (pos !== target.pos || node.type !== target.node.type) return
    placement = { index, parent, pos }
    return false
  })
  return placement
}

export const useMobileNodeActions = (
  editor: TiptapEditor | null,
  resolveDragTargetFromPoint: (clientX: number, clientY: number) => DragHandleTarget | null
) => {
  const [mobileNodeTarget, setMobileNodeTarget] =
    useState<DragHandleTarget | null>(null)

  const canMoveMobileTarget = useCallback(
    (direction: "up" | "down") => {
      if (!editor || !mobileNodeTarget) return false
      const placement = getTargetPlacement(editor, mobileNodeTarget)
      if (!placement?.parent) return false
      if (direction === "up") return placement.index > 0
      return placement.index < placement.parent.childCount - 1
    },
    [editor, mobileNodeTarget]
  )

  const moveMobileTarget = useCallback(
    (direction: "up" | "down") => {
      if (!editor || !mobileNodeTarget) return
      const placement = getTargetPlacement(editor, mobileNodeTarget)
      if (!placement?.parent) return

      const source = editor.state.doc.nodeAt(placement.pos)
      if (!source) return setMobileNodeTarget(null)

      const siblingIndex =
        direction === "up" ? placement.index - 1 : placement.index + 1
      if (siblingIndex < 0 || siblingIndex >= placement.parent.childCount) return

      const sibling = placement.parent.child(siblingIndex)
      const sourceEnd = placement.pos + source.nodeSize
      const nextPos =
        direction === "up"
          ? placement.pos - sibling.nodeSize
          : placement.pos + sibling.nodeSize

      const tr = editor.state.tr.delete(placement.pos, sourceEnd).insert(nextPos, source)

      editor.view.dispatch(tr.scrollIntoView())
      editor.view.focus()
      setMobileNodeTarget({ node: source, pos: nextPos })
    },
    [editor, mobileNodeTarget]
  )

  const handleMobileNodeClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!editor || !isMobileViewport()) return setMobileNodeTarget(null)
      const targetElement = event.target
      if (
        !(targetElement instanceof HTMLElement) ||
        targetElement.closest(
          "[data-mobile-action-bar], button, input, textarea, select, [role='button']"
        )
      ) {
        return
      }
      setMobileNodeTarget(
        resolveDragTargetFromPoint(event.clientX, event.clientY)
      )
    },
    [editor, resolveDragTargetFromPoint]
  )

  return {
    mobileNodeTarget,
    canMoveMobileTarget,
    moveMobileTarget,
    handleMobileNodeClick,
  }
}