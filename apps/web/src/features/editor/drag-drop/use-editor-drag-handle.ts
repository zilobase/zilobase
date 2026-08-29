import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { Editor as TiptapEditor } from "@tiptap/react"
import {
  getBlockDragHandleRect,
  resolveBlockDragTargetFromPoint,
} from "@/packages/editor/components/editor/block-drag"
import type { DragHandleState } from "../core/types"

export const useEditorDragHandle = (
  editor: TiptapEditor | null,
  dragHandleMenuOpen: boolean
) => {
  const dragHandleRef = useRef<DragHandleState | null>(null)
  const pointerFrameRef = useRef<number | null>(null)
  const pointerPositionRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  )
  const [dragHandle, setDragHandle] = useState<DragHandleState | null>(null)

  const resolveDragTargetFromPoint = useCallback(
    (clientX: number, clientY: number) =>
      editor
        ? resolveBlockDragTargetFromPoint({
            clientX,
            clientY,
            currentTarget: dragHandleRef.current?.target ?? null,
            view: editor.view,
          })
        : null,
    [editor]
  )

  const clearDesktopDragHandle = useCallback(() => {
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current)
      pointerFrameRef.current = null
    }
    pointerPositionRef.current = null
    dragHandleRef.current = null
    setDragHandle(null)
  }, [])

  const showDesktopDragHandle = useCallback((nextHandle: DragHandleState) => {
    const current = dragHandleRef.current
    if (
      current?.target.pos === nextHandle.target.pos &&
      current.target.node === nextHandle.target.node &&
      current.position.left === nextHandle.position.left &&
      current.position.top === nextHandle.position.top
    ) {
      return
    }
    dragHandleRef.current = nextHandle
    setDragHandle(nextHandle)
  }, [])

  const updateDragTargetFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (dragHandleMenuOpen || !editor) return
      pointerPositionRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      }

      if (pointerFrameRef.current !== null) return

      pointerFrameRef.current = window.requestAnimationFrame(() => {
        pointerFrameRef.current = null
        const pointer = pointerPositionRef.current
        if (!pointer || editor.isDestroyed) return

        const nextTarget = resolveDragTargetFromPoint(
          pointer.clientX,
          pointer.clientY,
        )
        if (!nextTarget) return clearDesktopDragHandle()
        const position = getBlockDragHandleRect(editor.view, nextTarget)
        if (!position) return clearDesktopDragHandle()
        showDesktopDragHandle({ position, target: nextTarget })
      })
    },
    [
      clearDesktopDragHandle,
      dragHandleMenuOpen,
      editor,
      resolveDragTargetFromPoint,
      showDesktopDragHandle,
    ]
  )

  useEffect(() => {
    if (dragHandleMenuOpen) return
    const handleScroll = () => clearDesktopDragHandle()
    window.addEventListener("scroll", handleScroll, true)
    return () => window.removeEventListener("scroll", handleScroll, true)
  }, [clearDesktopDragHandle, dragHandleMenuOpen])

  useEffect(
    () => () => {
      if (pointerFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerFrameRef.current)
      }
    },
    [],
  )

  return {
    dragHandle,
    clearDesktopDragHandle,
    resolveDragTargetFromPoint,
    updateDragTargetFromPointer,
  }
}
