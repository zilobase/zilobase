import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react"

type TimelineBreakoutLayout = {
  marginLeft: number
  width: number
}

function layoutsMatch(
  current: TimelineBreakoutLayout | null,
  next: TimelineBreakoutLayout,
) {
  return (
    current !== null &&
    Math.abs(current.marginLeft - next.marginLeft) < 0.5 &&
    Math.abs(current.width - next.width) < 0.5
  )
}

/**
 * Lets an expanded timeline use the editor surface width while the rest of a
 * narrow page stays centered. This intentionally changes layout width instead
 * of introducing the inline horizontal-scroll treatment used by wide tables.
 */
export function useTimelineBreakout(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  measureKey?: unknown,
) {
  const [layout, setLayout] = useState<TimelineBreakoutLayout | null>(null)
  const measure = useCallback(() => {
    const timeline = ref.current
    const narrowPage = timeline?.closest<HTMLElement>(
      '[data-editor-page-content="narrow"]',
    )
    const editorSurface = timeline?.closest<HTMLElement>(
      "[data-editor-surface]",
    )
    const editor = timeline?.closest<HTMLElement>(".tiptap-editor")
    const anchor = timeline?.parentElement

    if (
      !enabled ||
      !timeline ||
      !narrowPage ||
      !editorSurface ||
      !editor ||
      !anchor
    ) {
      setLayout((current) => (current === null ? current : null))
      return
    }

    const surfaceRect = editorSurface.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const editorStyle = getComputedStyle(editor)
    const paddingLeft = Number.parseFloat(editorStyle.paddingLeft) || 0
    const paddingRight = Number.parseFloat(editorStyle.paddingRight) || 0
    const left = surfaceRect.left + paddingLeft
    const right = surfaceRect.right - paddingRight
    const nextLayout = {
      marginLeft: left - anchorRect.left,
      width: Math.max(anchorRect.width, right - left),
    }

    setLayout((current) =>
      layoutsMatch(current, nextLayout) ? current : nextLayout,
    )
  }, [enabled, measureKey, ref])

  useLayoutEffect(() => {
    measure()

    const timeline = ref.current
    const narrowPage = timeline?.closest<HTMLElement>(
      '[data-editor-page-content="narrow"]',
    )
    const editorSurface = timeline?.closest<HTMLElement>(
      "[data-editor-surface]",
    )

    if (typeof ResizeObserver === "undefined" || !timeline) {
      window.addEventListener("resize", measure)
      return () => window.removeEventListener("resize", measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(timeline.parentElement ?? timeline)
    if (narrowPage) observer.observe(narrowPage)
    if (editorSurface) observer.observe(editorSurface)
    window.addEventListener("resize", measure)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [measure, ref])

  return useMemo(
    () =>
      layout
        ? ({
            marginLeft: `${layout.marginLeft}px`,
            maxWidth: "none",
            width: `${layout.width}px`,
          } as CSSProperties)
        : undefined,
    [layout],
  )
}
