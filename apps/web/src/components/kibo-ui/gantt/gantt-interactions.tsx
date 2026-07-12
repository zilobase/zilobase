import {
  addDays,
  differenceInCalendarDays,
  format,
  formatDate,
} from "date-fns"
import { PlusIcon, TrashIcon } from "lucide-react"
import type {
  PointerEvent as ReactPointerEvent,
  PointerEventHandler,
  ReactNode,
} from "react"
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Card } from "@/components/ui/card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"

import {
  useGanttContext,
  useSetGanttDragging,
} from "./gantt-context"
import {
  dateToTimelineX,
  getTimelineItemWidth,
  getTimelineXFromElement,
  getTimelineXFromViewport,
  timelineXToDate,
} from "./gantt-geometry"
import type { GanttFeature, GanttMarkerProps } from "./gantt-types"
import { useGanttGeometry } from "./use-gantt-geometry"

const DRAG_THRESHOLD_PX = 4

type DragMode = "move" | "resize-end" | "resize-start"

type DragSession = {
  didDrag: boolean
  mode: DragMode
  originClientX: number
  originEnd: Date | null
  originPointerDate: Date
  originStart: Date
  pointerId: number
}

export type GanttFeatureDragHelperProps = {
  date: Date | null
  direction: "left" | "right"
  featureId: GanttFeature["id"]
  onPointerDown?: PointerEventHandler<HTMLDivElement>
}

export function GanttFeatureDragHelper({
  date,
  direction,
  featureId,
  onPointerDown,
}: GanttFeatureDragHelperProps) {
  return (
    <div
      aria-label={`${direction === "left" ? "Change start" : "Change end"} date`}
      className={cn(
        "group -translate-y-1/2 !cursor-col-resize absolute top-1/2 z-[3] h-full w-6 rounded-md outline-none",
        direction === "left" ? "-left-2.5" : "-right-2.5",
      )}
      data-feature-id={featureId}
      onPointerDown={onPointerDown}
      role="separator"
    >
      <div
        className={cn(
          "-translate-y-1/2 absolute top-1/2 h-[80%] w-1 rounded-sm bg-muted-foreground opacity-0 transition-opacity group-hover:opacity-100",
          direction === "left" ? "left-2.5" : "right-2.5",
        )}
      />
      {date ? (
        <div className="-translate-x-1/2 absolute top-10 hidden whitespace-nowrap rounded-lg border border-border/50 bg-background/90 px-2 py-1 text-foreground text-xs backdrop-blur-lg group-hover:block">
          {format(date, "MMM dd, yyyy")}
        </div>
      ) : null}
    </div>
  )
}

export type GanttFeatureItemCardProps = Pick<GanttFeature, "id"> & {
  children?: ReactNode
}

export function GanttFeatureItemCard({
  children,
  id,
}: GanttFeatureItemCardProps) {
  return (
    <Card
      className="h-full w-full rounded-md bg-background p-2 text-xs shadow-sm"
      data-feature-id={id}
    >
      <div className="flex h-full w-full items-center justify-between gap-2 text-left">
        {children}
      </div>
    </Card>
  )
}

export type GanttFeatureItemProps = GanttFeature & {
  children?: ReactNode
  className?: string
  onMove?: (id: string, startDate: Date, endDate: Date | null) => void
  stacked?: boolean
}

export function GanttFeatureItem({
  children,
  className,
  onMove,
  stacked = false,
  ...feature
}: GanttFeatureItemProps) {
  const gantt = useGanttContext()
  const geometry = useGanttGeometry()
  const setDragging = useSetGanttDragging()
  const sessionRef = useRef<DragSession | null>(null)
  const suppressClickRef = useRef(false)
  const [startAt, setStartAt] = useState(feature.startAt)
  const [endAt, setEndAt] = useState<Date | null>(feature.endAt)

  useEffect(() => setStartAt(feature.startAt), [feature.startAt])
  useEffect(() => setEndAt(feature.endAt), [feature.endAt])

  const offset = geometry ? dateToTimelineX(startAt, geometry) : 0
  const width = geometry
    ? getTimelineItemWidth(startAt, endAt, geometry)
    : 0

  const pointerDate = useCallback(
    (clientX: number) => {
      const scrollElement = gantt.ref?.current
      if (!scrollElement || !geometry) return null
      return timelineXToDate(
        getTimelineXFromViewport(clientX, scrollElement, gantt.sidebarWidth),
        geometry,
      )
    },
    [gantt.ref, gantt.sidebarWidth, geometry],
  )

  const beginDrag = (
    mode: DragMode,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!onMove || event.button !== 0) return
    const originPointerDate = pointerDate(event.clientX)
    if (!originPointerDate) return

    if (mode !== "move") {
      event.preventDefault()
      event.stopPropagation()
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    sessionRef.current = {
      didDrag: false,
      mode,
      originClientX: event.clientX,
      originEnd: endAt,
      originPointerDate,
      originStart: startAt,
      pointerId: event.pointerId,
    }
    setDragging(true)
  }

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const currentDate = pointerDate(event.clientX)
    if (!currentDate) return

    session.didDrag ||=
      Math.abs(event.clientX - session.originClientX) >= DRAG_THRESHOLD_PX
    if (!session.didDrag) return

    if (session.mode === "move") {
      const delta = differenceInCalendarDays(
        currentDate,
        session.originPointerDate,
      )
      setStartAt(addDays(session.originStart, delta))
      setEndAt(
        session.originEnd ? addDays(session.originEnd, delta) : null,
      )
      return
    }

    if (session.mode === "resize-start") {
      const latestEnd = session.originEnd ?? addDays(session.originStart, 1)
      setStartAt(
        currentDate < latestEnd ? currentDate : addDays(latestEnd, -1),
      )
      return
    }

    setEndAt(
      currentDate > session.originStart
        ? currentDate
        : addDays(session.originStart, 1),
    )
  }

  const finishDrag: PointerEventHandler<HTMLDivElement> = (event) => {
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    sessionRef.current = null
    setDragging(false)

    if (session.didDrag) {
      suppressClickRef.current = true
      onMove?.(feature.id, startAt, endAt)
    }
  }

  const cancelDrag: PointerEventHandler<HTMLDivElement> = (event) => {
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    sessionRef.current = null
    setStartAt(session.originStart)
    setEndAt(session.originEnd)
    setDragging(false)
  }

  const resizeFrom =
    (mode: "resize-end" | "resize-start") =>
    (event: ReactPointerEvent<HTMLDivElement>) =>
      beginDrag(mode, event)

  return (
    <div
      className={cn(
        "relative w-max min-w-full",
        stacked ? "h-full" : "flex py-0.5",
        className,
      )}
      style={stacked ? undefined : { height: "var(--gantt-row-height)" }}
    >
      <div
        className={cn(
          "pointer-events-auto absolute touch-none",
          stacked ? "inset-y-0" : "top-0.5",
        )}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return
          suppressClickRef.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
        onPointerCancel={cancelDrag}
        onPointerDown={(event) => beginDrag("move", event)}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        style={{
          height: stacked ? "100%" : "calc(var(--gantt-row-height) - 4px)",
          left: Math.round(offset),
          width: Math.round(width),
        }}
      >
        {onMove ? (
          <GanttFeatureDragHelper
            date={startAt}
            direction="left"
            featureId={feature.id}
            onPointerDown={resizeFrom("resize-start")}
          />
        ) : null}
        <GanttFeatureItemCard id={feature.id}>
          {children ?? (
            <p className="flex-1 truncate text-xs">{feature.name}</p>
          )}
        </GanttFeatureItemCard>
        {onMove ? (
          <GanttFeatureDragHelper
            date={endAt ?? addDays(startAt, 2)}
            direction="right"
            featureId={feature.id}
            onPointerDown={resizeFrom("resize-end")}
          />
        ) : null}
      </div>
    </div>
  )
}

export type GanttFeatureListGroupProps = {
  children: ReactNode
  className?: string
}

export function GanttFeatureListGroup({
  children,
  className,
}: GanttFeatureListGroupProps) {
  return (
    <div className={className} style={{ paddingTop: "var(--gantt-row-height)" }}>
      {children}
    </div>
  )
}

export type GanttFeatureRowProps = {
  children?: (feature: GanttFeature) => ReactNode
  className?: string
  features: GanttFeature[]
  onMove?: (id: string, startAt: Date, endAt: Date | null) => void
}

export function GanttFeatureRow({
  children,
  className,
  features,
  onMove,
}: GanttFeatureRowProps) {
  const lanes: Date[] = []
  const positioned = [...features]
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .map((feature) => {
      const lane = lanes.findIndex((endAt) => endAt <= feature.startAt)
      const laneIndex = lane === -1 ? lanes.length : lane
      lanes[laneIndex] = feature.endAt
      return { feature, laneIndex }
    })
  const laneHeight = 36

  return (
    <div
      className={cn("relative", className)}
      style={{
        height: `${Math.max(1, lanes.length) * laneHeight}px`,
        minHeight: "var(--gantt-row-height)",
      }}
    >
      {positioned.map(({ feature, laneIndex }) => (
        <div
          className="absolute w-full"
          key={feature.id}
          style={{ height: laneHeight, top: laneIndex * laneHeight }}
        >
          <GanttFeatureItem {...feature} onMove={onMove}>
            {children?.(feature)}
          </GanttFeatureItem>
        </div>
      ))}
    </div>
  )
}

export type GanttFeatureListProps = {
  children: ReactNode
  className?: string
  stacked?: boolean
}

export function GanttFeatureList({
  children,
  className,
  stacked = false,
}: GanttFeatureListProps) {
  return (
    <div
      className={cn(
        stacked
          ? "relative z-10 flex w-max min-w-full flex-col"
          : "absolute top-0 left-0 h-full w-max space-y-4",
        className,
      )}
      style={stacked ? undefined : { marginTop: "var(--gantt-header-height)" }}
    >
      {children}
    </div>
  )
}

function TimelineMarker({
  children,
  className,
  date,
}: {
  children: ReactNode
  className?: string
  date: Date
}) {
  const geometry = useGanttGeometry()
  const left = geometry ? dateToTimelineX(date, geometry) : 0

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-20 flex h-full select-none flex-col items-center justify-center overflow-visible"
      style={{ transform: `translateX(${left}px)`, width: 0 }}
    >
      {children}
      <div className={cn("h-full w-px bg-card", className)} />
    </div>
  )
}

export const GanttMarker = memo(function GanttMarker({
  className,
  date,
  id,
  label,
  onRemove,
}: GanttMarkerProps & {
  className?: string
  onRemove?: (id: string) => void
}) {
  return (
    <TimelineMarker className={className} date={date}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group pointer-events-auto sticky top-0 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-card px-2 py-1 text-foreground text-xs",
              className,
            )}
          >
            {label}
            <span className="max-h-[0] overflow-hidden opacity-80 transition-all group-hover:max-h-[2rem]">
              {formatDate(date, "MMM dd, yyyy")}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onRemove ? (
            <ContextMenuItem
              className="flex items-center gap-2 text-destructive"
              onClick={() => onRemove(id)}
            >
              <TrashIcon size={16} />
              Remove marker
            </ContextMenuItem>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    </TimelineMarker>
  )
})

export type GanttCreateMarkerTriggerProps = {
  className?: string
  onCreateMarker: (date: Date) => void
}

export function GanttCreateMarkerTrigger({
  className,
  onCreateMarker,
}: GanttCreateMarkerTriggerProps) {
  const geometry = useGanttGeometry()
  const triggerRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<Date | null>(null)

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!geometry) return
    const timelineX = getTimelineXFromElement(
      event.currentTarget,
      event.clientX,
    )
    const date = timelineXToDate(timelineX, geometry)
    dateRef.current = date
    event.currentTarget.style.setProperty("--gantt-marker-left", `${timelineX}px`)
    event.currentTarget.dataset.previewVisible = "true"
    const label = event.currentTarget.querySelector<HTMLElement>(
      "[data-gantt-marker-date]",
    )
    if (label) label.textContent = formatDate(date, "MMM dd, yyyy")
  }

  return (
    <div
      className={cn(
        "group pointer-events-auto absolute top-0 left-0 h-full w-full select-none overflow-visible",
        className,
      )}
      data-preview-visible="false"
      onPointerLeave={(event) => {
        event.currentTarget.dataset.previewVisible = "false"
      }}
      onPointerMove={handlePointerMove}
      ref={triggerRef}
    >
      <div className="gantt-marker-preview pointer-events-none sticky top-6 z-20 flex w-4 -translate-x-1/2 flex-col items-center justify-center gap-1 overflow-visible opacity-0">
        <button
          className="pointer-events-auto z-50 inline-flex h-4 w-4 items-center justify-center rounded-full bg-card"
          onClick={() => {
            if (dateRef.current) onCreateMarker(dateRef.current)
          }}
          type="button"
        >
          <PlusIcon className="text-muted-foreground" size={12} />
        </button>
        <div
          className="whitespace-nowrap rounded-full border border-border/50 bg-background/90 px-2 py-1 text-foreground text-xs backdrop-blur-lg"
          data-gantt-marker-date
        />
      </div>
    </div>
  )
}

export type GanttTimelineProps = {
  children: ReactNode
  className?: string
}

export function GanttTimeline({ children, className }: GanttTimelineProps) {
  return (
    <div
      className={cn(
        "relative flex h-full w-max flex-none overflow-clip",
        className,
      )}
    >
      {children}
    </div>
  )
}

export type GanttTodayProps = { className?: string }

export function GanttToday({ className }: GanttTodayProps) {
  const date = useMemo(() => new Date(), [])

  return (
    <TimelineMarker className={className} date={date}>
      <div
        className={cn(
          "group pointer-events-auto sticky top-0 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-card px-2 py-1 text-foreground text-xs",
          className,
        )}
      >
        Today
        <span className="max-h-[0] overflow-hidden opacity-80 transition-all group-hover:max-h-[2rem]">
          {formatDate(date, "MMM dd, yyyy")}
        </span>
      </div>
    </TimelineMarker>
  )
}
