import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react"

import {
  getDatabaseHorizontalWheelDelta,
  preserveDatabaseScrollLeftOnVerticalWheel,
} from "./database-wheel-scroll"

export type InlineDatabaseScrollLayout = {
  contentWidth: number
  offset: number
  viewWidth: number
  viewportWidth: number
}

type UseInlineDatabaseScrollOptions = {
  contentRef?: RefObject<HTMLElement | null>
  enabled?: boolean
  getContentWidth: () => number
  measureKey?: unknown
  scrollRef?: RefObject<HTMLElement | null>
  wrapperRef: RefObject<HTMLElement | null>
}

function isSameLayout(
  currentLayout: InlineDatabaseScrollLayout | null,
  nextLayout: InlineDatabaseScrollLayout
) {
  return (
    currentLayout &&
    Math.abs(currentLayout.contentWidth - nextLayout.contentWidth) < 0.5 &&
    Math.abs(currentLayout.offset - nextLayout.offset) < 0.5 &&
    Math.abs(currentLayout.viewWidth - nextLayout.viewWidth) < 0.5 &&
    Math.abs(currentLayout.viewportWidth - nextLayout.viewportWidth) < 0.5
  )
}

export function useInlineDatabaseScroll({
  contentRef,
  enabled = true,
  getContentWidth,
  measureKey,
  scrollRef,
  wrapperRef,
}: UseInlineDatabaseScrollOptions) {
  const [layout, setLayout] = useState<InlineDatabaseScrollLayout | null>(null)
  const measureLayout = useCallback(() => {
    const wrapperElement = wrapperRef.current
    const narrowPageContent = wrapperElement?.closest<HTMLElement>(
      '[data-editor-page-content="narrow"]'
    )
    const editorSurface = wrapperElement?.closest<HTMLElement>(
      "[data-editor-surface]"
    )

    if (!enabled || !wrapperElement || !narrowPageContent || !editorSurface) {
      setLayout((currentLayout) =>
        currentLayout === null ? currentLayout : null
      )
      return
    }

    const wrapperRect = wrapperElement.getBoundingClientRect()
    const surfaceRect = editorSurface.getBoundingClientRect()
    const offset = Math.max(0, wrapperRect.left - surfaceRect.left)
    const trailingOffset = Math.max(0, surfaceRect.right - wrapperRect.right)
    const viewportWidth = Math.max(wrapperRect.width, surfaceRect.width)
    const contentWidthValue = getContentWidth()
    const viewWidth = Math.max(wrapperRect.width, contentWidthValue)
    const contentWidth = offset + viewWidth + trailingOffset
    const nextLayout = {
      contentWidth,
      offset,
      viewWidth,
      viewportWidth,
    }

    setLayout((currentLayout) =>
      isSameLayout(currentLayout, nextLayout) ? currentLayout : nextLayout
    )
  }, [enabled, getContentWidth, wrapperRef])

  useLayoutEffect(() => {
    measureLayout()

    const wrapperElement = wrapperRef.current
    const contentElement = contentRef?.current
    const narrowPageContent = wrapperElement?.closest<HTMLElement>(
      '[data-editor-page-content="narrow"]'
    )
    const editorSurface = wrapperElement?.closest<HTMLElement>(
      "[data-editor-surface]"
    )

    if (typeof ResizeObserver === "undefined" || !wrapperElement) {
      window.addEventListener("resize", measureLayout)

      return () => window.removeEventListener("resize", measureLayout)
    }

    const resizeObserver = new ResizeObserver(measureLayout)

    resizeObserver.observe(wrapperElement)

    if (contentElement) {
      resizeObserver.observe(contentElement)
    }

    if (narrowPageContent) {
      resizeObserver.observe(narrowPageContent)
    }

    if (editorSurface) {
      resizeObserver.observe(editorSurface)
    }

    window.addEventListener("resize", measureLayout)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", measureLayout)
    }
  }, [contentRef, measureKey, measureLayout, wrapperRef])

  useEffect(() => {
    const scrollElement = scrollRef?.current

    if (!enabled || !scrollElement) {
      return
    }

    const onWheel = (event: WheelEvent) => {
      handleInlineDatabaseScrollWheel(event, scrollElement)
    }

    scrollElement.addEventListener("wheel", onWheel, { passive: false })

    return () => scrollElement.removeEventListener("wheel", onWheel)
  }, [enabled, measureKey, scrollRef])

  const style = useMemo(
    () =>
      layout
        ? ({
            "--database-inline-scroll-content-width": `${layout.contentWidth}px`,
            "--database-inline-scroll-offset": `${layout.offset}px`,
            "--database-inline-scroll-view-width": `${layout.viewWidth}px`,
            "--database-inline-scroll-viewport-width": `${layout.viewportWidth}px`,
          } as CSSProperties)
        : undefined,
    [layout]
  )

  return {
    isInlineScrollEnabled: layout !== null,
    layout,
    measureLayout,
    style,
  }
}

function handleInlineDatabaseScrollWheel(
  event: WheelEvent,
  scrollElement: HTMLElement
) {
  if (isNestedDatabaseCellScroll(event, scrollElement)) {
    return
  }

  const horizontalDelta = getDatabaseHorizontalWheelDelta(event)

  if (!horizontalDelta) {
    preserveDatabaseScrollLeftOnVerticalWheel(event, [scrollElement])
    return
  }

  const maxScrollLeft = scrollElement.scrollWidth - scrollElement.clientWidth

  if (maxScrollLeft <= 1) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, scrollElement.scrollLeft + horizontalDelta)
  )

  if (nextScrollLeft === scrollElement.scrollLeft) {
    return
  }

  scrollElement.scrollLeft = nextScrollLeft
}

function isNestedDatabaseCellScroll(
  event: WheelEvent,
  scrollElement: HTMLElement
) {
  const target = event.target

  return (
    target instanceof HTMLElement &&
    scrollElement.contains(target) &&
    Boolean(target.closest("[data-database-cell-scroll]"))
  )
}
