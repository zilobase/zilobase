import { PlusIcon } from "lucide-react"
import type {
  CSSProperties,
  MouseEvent,
  PointerEventHandler,
} from "react"
import { useCallback, useRef } from "react"

import { cn } from "@/lib/utils"

import { useGanttContext } from "./gantt-context"
import {
  getGanttSelection,
  getTimelineXFromElement,
  type GanttSelection,
} from "./gantt-geometry"
import {
  hideGanttPreview,
  shouldPositionGanttPreviewOnFocus,
  showGanttPreview,
} from "./gantt-preview"
import { useGanttGeometry } from "./use-gantt-geometry"

export type GanttAddFeatureRowProps = {
  "aria-label"?: string
  className?: string
  disabled?: boolean
  durationDays?: number
  onAddItem: (startAt: Date, endAt: Date) => void
}

export function GanttAddFeatureRow({
  "aria-label": ariaLabel = "Add timeline item",
  className,
  disabled = false,
  durationDays = 1,
  onAddItem,
}: GanttAddFeatureRowProps) {
  const gantt = useGanttContext()
  const geometry = useGanttGeometry()
  const selectionRef = useRef<GanttSelection | null>(null)
  const pendingRef = useRef(false)

  const selectAtClientX = useCallback(
    (element: HTMLButtonElement, clientX: number) => {
      if (!geometry) return null
      const selection = getGanttSelection(
        getTimelineXFromElement(element, clientX),
        durationDays,
        geometry,
      )
      selectionRef.current = selection
      showGanttPreview(element, selection)
      return selection
    },
    [durationDays, geometry],
  )

  const handlePointerMove: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!pendingRef.current) selectAtClientX(event.currentTarget, event.clientX)
  }

  const handlePointerLeave: PointerEventHandler<HTMLButtonElement> = (event) => {
    pendingRef.current = false
    selectionRef.current = null
    hideGanttPreview(event.currentTarget)
  }

  const handleFocus = (element: HTMLButtonElement) => {
    if (!geometry || pendingRef.current) return
    const scrollElement = gantt.ref?.current
    if (!scrollElement) return

    const scrollRect = scrollElement.getBoundingClientRect()
    const visibleTimelineWidth = Math.max(
      0,
      scrollElement.clientWidth - gantt.sidebarWidth,
    )
    selectAtClientX(
      element,
      scrollRect.left + gantt.sidebarWidth + visibleTimelineWidth / 2,
    )
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const element = event.currentTarget
    const selection =
      event.detail === 0
        ? selectionRef.current
        : selectAtClientX(element, event.clientX)
    if (!selection) return

    // Hide synchronously before the database mutation can remount this row.
    pendingRef.current = true
    hideGanttPreview(element)
    onAddItem(selection.startAt, selection.endAt)
  }

  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "pointer-events-auto relative h-full min-w-full overflow-hidden outline-none",
        className,
      )}
      data-preview-visible="false"
      disabled={disabled}
      onBlur={(event) => {
        pendingRef.current = false
        selectionRef.current = null
        hideGanttPreview(event.currentTarget)
      }}
      onClick={handleClick}
      onFocus={(event) => {
        if (shouldPositionGanttPreviewOnFocus(event.currentTarget)) {
          handleFocus(event.currentTarget)
        }
      }}
      onMouseEnter={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      onMouseMove={handlePointerMove}
      onPointerDown={handlePointerMove}
      onPointerEnter={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      style={
        {
          "--gantt-add-left": "0px",
          "--gantt-add-opacity": "0",
          "--gantt-add-width": `calc(var(--gantt-column-width) * ${durationDays})`,
          width: gantt.timelineWidth,
        } as CSSProperties
      }
      type="button"
    >
      <span
        aria-hidden="true"
        className="gantt-add-preview pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center rounded-md border border-dashed"
        data-timeline-add-indicator
      >
        <PlusIcon className="select-none text-muted-foreground" size={16} />
      </span>
    </button>
  )
}
