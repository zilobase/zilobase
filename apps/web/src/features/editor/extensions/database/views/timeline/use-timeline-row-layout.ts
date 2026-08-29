import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from "react"

import {
  emptyTimelineRowLayout,
  getTimelineRowDropTargetIndex,
  timelineRowLayoutsMatch,
  type TimelineRowLayout,
} from "./database-timeline-layout"

const TIMELINE_ITEM_SELECTOR =
  ".database-timeline-sidebar-row[data-timeline-row-id]"

export function useTimelineRowLayout({
  measureKey,
  rowIds,
  timelineRef,
}: {
  measureKey: unknown
  rowIds: string[]
  timelineRef: RefObject<HTMLDivElement | null>
}) {
  const [layout, setLayout] = useState<TimelineRowLayout>(
    emptyTimelineRowLayout,
  )
  const measureFrameRef = useRef<number | null>(null)
  const scrollTopsRef = useRef(new WeakMap<HTMLElement, number>())

  const measureRows = useCallback(() => {
    const timeline = timelineRef.current
    if (!timeline) {
      return emptyTimelineRowLayout
    }

    const nextLayout = measureTimelineRows(timeline)
    setLayout((current) =>
      timelineRowLayoutsMatch(current, nextLayout) ? current : nextLayout,
    )
    return nextLayout
  }, [timelineRef])

  const scheduleMeasurement = useCallback(() => {
    if (measureFrameRef.current !== null) return

    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null
      measureRows()
    })
  }, [measureRows])

  useLayoutEffect(() => {
    measureRows()
    const timeline = timelineRef.current
    const cancelScheduledMeasurement = () => {
      if (measureFrameRef.current === null) return
      window.cancelAnimationFrame(measureFrameRef.current)
      measureFrameRef.current = null
    }

    window.addEventListener("resize", scheduleMeasurement)

    if (!timeline || typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", scheduleMeasurement)
        cancelScheduledMeasurement()
      }
    }

    const observer = new ResizeObserver(scheduleMeasurement)
    observer.observe(timeline)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", scheduleMeasurement)
      cancelScheduledMeasurement()
    }
  }, [measureKey, measureRows, scheduleMeasurement, timelineRef])

  const getDropTargetIndex = useCallback(
    (clientY: number) => {
      const timeline = timelineRef.current
      if (!timeline || rowIds.length === 0) return 0

      return getTimelineRowDropTargetIndex(
        rowIds,
        layout.centers,
        clientY - timeline.getBoundingClientRect().top,
      )
    },
    [layout.centers, rowIds, timelineRef],
  )

  const handleScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      const scrollElement = event.target as HTMLElement
      const previousScrollTop = scrollTopsRef.current.get(scrollElement) ?? 0

      if (previousScrollTop === scrollElement.scrollTop) return

      scrollTopsRef.current.set(scrollElement, scrollElement.scrollTop)
      scheduleMeasurement()
    },
    [scheduleMeasurement],
  )

  return {
    getDropTargetIndex,
    handleScroll,
    layout,
    measureRows,
  }
}

function measureTimelineRows(timeline: HTMLDivElement): TimelineRowLayout {
  const timelineTop = timeline.getBoundingClientRect().top
  const rowElements = timeline.querySelectorAll<HTMLElement>(
    TIMELINE_ITEM_SELECTOR,
  )
  const centers: Record<string, number> = {}
  const dropTops: number[] = []

  rowElements.forEach((rowElement, index) => {
    const rect = rowElement.getBoundingClientRect()
    const top = rect.top - timelineTop
    const rowId = rowElement.dataset.timelineRowId

    if (rowId) centers[rowId] = top + rect.height / 2
    dropTops[index] = top
    if (index === rowElements.length - 1) {
      dropTops[index + 1] = top + rect.height
    }
  })

  return { centers, dropTops }
}
