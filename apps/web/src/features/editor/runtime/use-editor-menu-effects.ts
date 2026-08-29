import { useEffect, type RefObject } from "react"
import { findScrollLockElement } from "../core/dom"

type UseEditorMenuEffectsOptions = {
  dragHandleMenuOpen: boolean
  editorSurfaceRef: RefObject<HTMLElement | null>
  plusMenuOpen: boolean
  setPlusMenuOpen: (open: boolean) => void
}

export const useEditorMenuEffects = ({
  dragHandleMenuOpen,
  editorSurfaceRef,
  plusMenuOpen,
  setPlusMenuOpen,
}: UseEditorMenuEffectsOptions) => {
  useEffect(() => {
    if (!plusMenuOpen) return
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlusMenuOpen(false)
    }
    window.addEventListener("keydown", closeMenu)
    return () => window.removeEventListener("keydown", closeMenu)
  }, [plusMenuOpen, setPlusMenuOpen])

  useEffect(() => {
    if (!dragHandleMenuOpen) return
    const scrollLockElement = findScrollLockElement(editorSurfaceRef.current)
    const originalOverflowY = scrollLockElement.style.overflowY
    const originalOverscrollBehavior = scrollLockElement.style.overscrollBehavior
    scrollLockElement.style.overflowY = "hidden"
    scrollLockElement.style.overscrollBehavior = "none"
    return () => {
      scrollLockElement.style.overflowY = originalOverflowY
      scrollLockElement.style.overscrollBehavior = originalOverscrollBehavior
    }
  }, [dragHandleMenuOpen, editorSurfaceRef])
}
