import { addDays, formatDistance, isSameDay } from "date-fns"
import type {
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
} from "react"

import { cn } from "@/lib/utils"

import { useGanttContext } from "./gantt-context"
import type { GanttFeature } from "./gantt-types"

export type GanttSidebarItemProps = {
  className?: string
  feature: GanttFeature
  onSelectItem?: (id: string) => void
}

export function GanttSidebarItem({
  className,
  feature,
  onSelectItem,
}: GanttSidebarItemProps) {
  const gantt = useGanttContext()
  const effectiveEnd = isSameDay(feature.startAt, feature.endAt)
    ? addDays(feature.endAt, 1)
    : feature.endAt
  const duration = effectiveEnd
    ? formatDistance(feature.startAt, effectiveEnd)
    : `${formatDistance(feature.startAt, new Date())} so far`

  const select = () => {
    gantt.scrollToFeature?.(feature)
    onSelectItem?.(feature.id)
  }
  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) select()
  }
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      select()
    }
  }

  return (
    <div
      className={cn(
        "relative flex items-center gap-2.5 p-2.5 text-xs hover:bg-secondary",
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      style={{ height: "var(--gantt-row-height)" }}
      tabIndex={0}
    >
      <div
        className="pointer-events-none h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: feature.status.color }}
      />
      <p className="pointer-events-none flex-1 truncate text-left font-medium">
        {feature.name}
      </p>
      <p className="pointer-events-none text-muted-foreground">{duration}</p>
    </div>
  )
}

export function GanttSidebarHeader() {
  return (
    <div
      className="sticky top-0 z-10 flex shrink-0 items-end justify-between gap-2.5 border-border/50 border-b bg-backdrop/90 p-2.5 font-medium text-muted-foreground text-xs backdrop-blur-sm"
      style={{ height: "var(--gantt-header-height)" }}
    >
      <p className="flex-1 truncate text-left">Issues</p>
      <p className="shrink-0">Duration</p>
    </div>
  )
}

export type GanttSidebarGroupProps = {
  children: ReactNode
  className?: string
  name: string
}

export function GanttSidebarGroup({
  children,
  className,
  name,
}: GanttSidebarGroupProps) {
  return (
    <div className={className}>
      <p
        className="w-full truncate p-2.5 text-left font-medium text-muted-foreground text-xs"
        style={{ height: "var(--gantt-row-height)" }}
      >
        {name}
      </p>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  )
}

export type GanttSidebarProps = {
  children: ReactNode
  className?: string
}

export function GanttSidebar({ children, className }: GanttSidebarProps) {
  return (
    <div
      className={cn(
        "sticky left-0 z-30 h-max min-h-full overflow-clip border-border/50 border-r bg-background/90 backdrop-blur-md",
        className,
      )}
      data-roadmap-ui="gantt-sidebar"
    >
      <GanttSidebarHeader />
      <div className="space-y-4">{children}</div>
    </div>
  )
}
