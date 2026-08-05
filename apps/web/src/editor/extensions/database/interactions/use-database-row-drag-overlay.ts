import { useCallback, useEffect, useRef, useState } from "react"

import type { DatabaseRowDragOverlay } from "./database-row-drag"

type FinishDragRef = {
  current: () => void
}

export function useDatabaseRowDragOverlay(finishDragRef: FinishDragRef) {
  const [overlay, setOverlay] = useState<DatabaseRowDragOverlay | null>(null)
  const elementRef = useRef<HTMLDivElement | null>(null)
  const snapshotRef = useRef<DatabaseRowDragOverlay | null>(null)
  const pendingPositionRef = useRef<{ left: number; top: number } | null>(null)
  const positionRef = useRef({ left: 0, top: 0 })
  const frameRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    pendingPositionRef.current = null
    snapshotRef.current = null
    setOverlay(null)
  }, [])

  const start = useCallback((nextOverlay: DatabaseRowDragOverlay) => {
    snapshotRef.current = nextOverlay
    positionRef.current = {
      left: nextOverlay.left,
      top: nextOverlay.top,
    }
    setOverlay(nextOverlay)
  }, [])

  useEffect(() => {
    if (!overlay) return

    let dropCleanupTimer: number | null = null
    const move = (event: DragEvent) => {
      const currentOverlay = snapshotRef.current

      // Some browsers emit a final drag event at 0,0 before dragend.
      if (!currentOverlay || (event.clientX === 0 && event.clientY === 0)) {
        return
      }

      const position = {
        left: event.clientX - currentOverlay.offsetX,
        top: event.clientY - currentOverlay.offsetY,
      }
      pendingPositionRef.current = position
      positionRef.current = position
      if (frameRef.current !== null) return

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        const nextPosition = pendingPositionRef.current
        pendingPositionRef.current = null
        if (!nextPosition || !elementRef.current) return

        elementRef.current.style.transform =
          `translate3d(${nextPosition.left}px, ${nextPosition.top}px, 0)`
      })
    }
    const finishAfterDrop = () => {
      if (dropCleanupTimer !== null) window.clearTimeout(dropCleanupTimer)

      // Let the destination read source refs before clearing the session.
      dropCleanupTimer = window.setTimeout(() => finishDragRef.current(), 0)
    }
    const finish = () => finishDragRef.current()

    window.addEventListener("drag", move, true)
    window.addEventListener("dragover", move, true)
    window.addEventListener("dragend", finish, true)
    window.addEventListener("drop", finishAfterDrop, true)
    window.addEventListener("blur", finish)

    return () => {
      window.removeEventListener("drag", move, true)
      window.removeEventListener("dragover", move, true)
      window.removeEventListener("dragend", finish, true)
      window.removeEventListener("drop", finishAfterDrop, true)
      window.removeEventListener("blur", finish)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      if (dropCleanupTimer !== null) window.clearTimeout(dropCleanupTimer)
    }
  }, [finishDragRef, overlay])

  return { clear, elementRef, overlay, positionRef, start }
}
