import type { CSSProperties, ReactNode } from "react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { cn } from "@/lib/utils"

import { GanttContext, useSetGanttScrollX } from "./gantt-context"
import {
  createInitialTimelineData,
  createTimelineYear,
  getTimelineColumnCount,
} from "./gantt-data"
import {
  dateToTimelineX,
  getGanttColumnWidth,
  getTimelineStart,
} from "./gantt-geometry"
import type {
  GanttContextProps,
  GanttFeature,
  Range,
  TimelineData,
} from "./gantt-types"

const SCROLL_EDGE_TOLERANCE = 1

export type GanttProviderProps = {
  children: ReactNode
  className?: string
  headerHeight?: number
  hideHeaderTitle?: boolean
  range?: Range
  rowHeight?: number
  scrollClassName?: string
  style?: CSSProperties
  toolbar?: ReactNode
  zoom?: number
}

export function GanttProvider({
  children,
  className,
  headerHeight = 60,
  hideHeaderTitle = false,
  range = "monthly",
  rowHeight = 36,
  scrollClassName,
  style,
  toolbar,
  zoom = 100,
}: GanttProviderProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitialScroll = useRef(false)
  const scrollFrame = useRef<number | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(0)
  const [timelineData, setTimelineData] = useState<TimelineData>(() =>
    createInitialTimelineData(new Date()),
  )
  const setScrollX = useSetGanttScrollX()
  const columnWidth = getGanttColumnWidth(range, zoom)
  const timelineWidth = useMemo(
    () => getTimelineColumnCount(timelineData, range) * columnWidth,
    [columnWidth, range, timelineData],
  )

  const scrollToDate = useCallback(
    (date: Date) => {
      const scrollElement = scrollRef.current
      const firstYear = timelineData[0]?.year
      if (!scrollElement || firstYear === undefined) return

      const timelineX = dateToTimelineX(date, {
        columnWidth,
        range,
        timelineStart: getTimelineStart(firstYear),
      })
      const left = Math.max(
        0,
        sidebarWidth + timelineX - scrollElement.clientWidth / 3,
      )
      scrollElement.scrollTo({ behavior: "smooth", left })
    },
    [columnWidth, range, sidebarWidth, timelineData],
  )

  const scrollToFeature = useCallback(
    (feature: GanttFeature) => scrollToDate(feature.startAt),
    [scrollToDate],
  )

  const contextValue = useMemo<GanttContextProps>(
    () => ({
      columnWidth: getGanttColumnWidth(range, 100),
      headerHeight,
      hideHeaderTitle,
      placeholderLength: 2,
      range,
      ref: scrollRef,
      rowHeight,
      scrollToDate,
      scrollToFeature,
      sidebarWidth,
      timelineData,
      timelineWidth,
      zoom,
    }),
    [
      headerHeight,
      hideHeaderTitle,
      range,
      rowHeight,
      scrollToDate,
      scrollToFeature,
      sidebarWidth,
      timelineData,
      timelineWidth,
      zoom,
    ],
  )

  const cssVariables = useMemo(
    () =>
      ({
        "--gantt-column-width": `${columnWidth}px`,
        "--gantt-header-height": `${headerHeight}px`,
        "--gantt-row-height": `${rowHeight}px`,
        "--gantt-sidebar-width":
          sidebarWidth > 0 ? `${sidebarWidth}px` : undefined,
        "--gantt-zoom": `${zoom}`,
      }) as CSSProperties,
    [columnWidth, headerHeight, rowHeight, sidebarWidth, zoom],
  )

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement || didInitialScroll.current) return

    const frame = requestAnimationFrame(() => {
      scrollElement.scrollLeft = Math.max(
        0,
        scrollElement.scrollWidth / 2 - scrollElement.clientWidth / 2,
      )
      setScrollX(scrollElement.scrollLeft)
      didInitialScroll.current = true
    })

    return () => cancelAnimationFrame(frame)
  }, [setScrollX])

  useEffect(() => {
    const scrollElement = scrollRef.current
    const sidebarElement = scrollElement?.querySelector<HTMLElement>(
      '[data-roadmap-ui="gantt-sidebar"]',
    )
    if (!sidebarElement) return

    const measure = () => {
      const nextWidth = Math.round(sidebarElement.getBoundingClientRect().width)
      if (nextWidth > 0) setSidebarWidth(nextWidth)
    }
    measure()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure)
      return () => window.removeEventListener("resize", measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(sidebarElement)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    const extendTimelineAtEdge = () => {
      scrollFrame.current = null
      const { clientWidth, scrollLeft, scrollWidth } = scrollElement
      setScrollX(scrollLeft)

      if (scrollLeft <= SCROLL_EDGE_TOLERANCE) {
        const previousWidth = scrollWidth
        setTimelineData((current) => {
          const firstYear = current[0]?.year
          return firstYear === undefined
            ? current
            : [createTimelineYear(firstYear - 1), ...current]
        })
        requestAnimationFrame(() => {
          scrollElement.scrollLeft += scrollElement.scrollWidth - previousWidth
          setScrollX(scrollElement.scrollLeft)
        })
        return
      }

      if (scrollLeft + clientWidth >= scrollWidth - SCROLL_EDGE_TOLERANCE) {
        setTimelineData((current) => {
          const lastYear = current.at(-1)?.year
          return lastYear === undefined
            ? current
            : [...current, createTimelineYear(lastYear + 1)]
        })
      }
    }

    const handleScroll = () => {
      if (scrollFrame.current !== null) return
      scrollFrame.current = requestAnimationFrame(extendTimelineAtEdge)
    }

    scrollElement.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener("scroll", handleScroll)
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
    }
  }, [setScrollX])

  return (
    <GanttContext.Provider value={contextValue}>
      <div
        className={cn(
          "gantt flex h-full w-full min-h-0 flex-col rounded-sm bg-secondary",
          range,
          className,
        )}
        style={cssVariables}
      >
        {toolbar}
        <div
          className={cn(
            "gantt-scroll relative isolate grid min-h-0 w-full flex-1 select-none overflow-auto",
            scrollClassName,
          )}
          ref={scrollRef}
          style={{
            gridTemplateColumns: "var(--gantt-sidebar-width) 1fr",
            ...style,
          }}
        >
          {children}
        </div>
      </div>
    </GanttContext.Provider>
  )
}
