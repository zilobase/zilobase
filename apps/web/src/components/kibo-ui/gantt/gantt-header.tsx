import { addDays, format } from "date-fns"
import type { FC, ReactNode } from "react"
import { memo, useId } from "react"

import { cn } from "@/lib/utils"

import { useGanttContext } from "./gantt-context"
import type { Range } from "./gantt-types"

export type GanttContentHeaderProps = {
  columns: number
  renderHeaderItem: (index: number) => ReactNode
  title: string
}

export function GanttContentHeader({
  columns,
  renderHeaderItem,
  title,
}: GanttContentHeaderProps) {
  const id = useId()
  const gantt = useGanttContext()

  return (
    <div
      className="gantt-content-header sticky top-0 z-20 flex w-full shrink-0 flex-col border-border/50 border-b bg-background"
      style={{ height: "var(--gantt-header-height)" }}
    >
      {!gantt.hideHeaderTitle ? (
        <div className="gantt-content-header-title shrink-0">
          <div
            className="sticky inline-flex whitespace-nowrap px-3 py-2 text-muted-foreground text-xs"
            style={{ left: "var(--gantt-sidebar-width)" }}
          >
            <p>{title}</p>
          </div>
        </div>
      ) : null}
      <div
        className="grid h-full min-h-0 w-full flex-1"
        style={{
          gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
        }}
      >
        {Array.from({ length: columns }, (_, index) => (
          <div
            className="flex h-full shrink-0 items-center justify-center border-border/50 border-r py-0 text-center text-xs last:border-r-0"
            key={`${id}-${index}`}
          >
            {renderHeaderItem(index)}
          </div>
        ))}
      </div>
    </div>
  )
}

export type GanttColumnProps = {
  index: number
  isColumnSecondary?: (index: number) => boolean
}

export const GanttColumn = memo(function GanttColumn({
  index,
  isColumnSecondary,
}: GanttColumnProps) {
  return (
    <div
      className={cn(
        "group relative h-full overflow-hidden",
        isColumnSecondary?.(index) && "bg-secondary",
      )}
    />
  )
})

export type GanttColumnsProps = {
  columns: number
  isColumnSecondary?: (index: number) => boolean
}

export function GanttColumns({
  columns,
  isColumnSecondary,
}: GanttColumnsProps) {
  const id = useId()

  return (
    <div
      className="gantt-columns grid min-h-0 w-full flex-1 divide-x divide-border/50"
      style={{
        gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
      }}
    >
      {Array.from({ length: columns }, (_, index) => (
        <GanttColumn
          index={index}
          isColumnSecondary={isColumnSecondary}
          key={`${id}-${index}`}
        />
      ))}
    </div>
  )
}

type GanttHeaderVariant = "dates" | "full" | "grid"
type RangeHeaderProps = { variant: GanttHeaderVariant }

function HeaderSection({
  children,
  variant,
}: {
  children: ReactNode
  variant: GanttHeaderVariant
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col",
        variant === "dates" ? "shrink-0" : "flex-1",
      )}
      style={
        variant === "dates"
          ? { height: "var(--gantt-header-height)" }
          : undefined
      }
    >
      {children}
    </div>
  )
}

const DailyHeader: FC<RangeHeaderProps> = ({ variant }) => {
  const gantt = useGanttContext()
  const showDates = variant !== "grid"
  const showGrid = variant !== "dates"

  return gantt.timelineData.flatMap((year) =>
    year.quarters.flatMap((quarter) => quarter.months).map((month, monthIndex) => {
      const firstOfMonth = new Date(year.year, monthIndex, 1)
      return (
        <HeaderSection key={`${year.year}-${monthIndex}`} variant={variant}>
          {showDates ? (
            <GanttContentHeader
              columns={month.days}
              renderHeaderItem={(dayIndex) => {
                const date = addDays(firstOfMonth, dayIndex)
                return (
                  <div className="flex items-center justify-center gap-1">
                    <p>{format(date, "d")}</p>
                    <p className="text-muted-foreground">
                      {format(date, "EEEEE")}
                    </p>
                  </div>
                )
              }}
              title={format(firstOfMonth, "MMMM yyyy")}
            />
          ) : null}
          {showGrid ? (
            <GanttColumns
              columns={month.days}
              isColumnSecondary={(dayIndex) =>
                [0, 6].includes(addDays(firstOfMonth, dayIndex).getDay())
              }
            />
          ) : null}
        </HeaderSection>
      )
    }),
  )
}

const MonthlyHeader: FC<RangeHeaderProps> = ({ variant }) => {
  const gantt = useGanttContext()
  const showDates = variant !== "grid"
  const showGrid = variant !== "dates"

  return gantt.timelineData.map((year) => (
    <HeaderSection key={year.year} variant={variant}>
      {showDates ? (
        <GanttContentHeader
          columns={12}
          renderHeaderItem={(monthIndex) => (
            <p>{format(new Date(year.year, monthIndex, 1), "MMM")}</p>
          )}
          title={`${year.year}`}
        />
      ) : null}
      {showGrid ? <GanttColumns columns={12} /> : null}
    </HeaderSection>
  ))
}

const QuarterlyHeader: FC<RangeHeaderProps> = ({ variant }) => {
  const gantt = useGanttContext()
  const showDates = variant !== "grid"
  const showGrid = variant !== "dates"

  return gantt.timelineData.flatMap((year) =>
    year.quarters.map((quarter, quarterIndex) => (
      <HeaderSection key={`${year.year}-${quarterIndex}`} variant={variant}>
        {showDates ? (
          <GanttContentHeader
            columns={quarter.months.length}
            renderHeaderItem={(monthIndex) => (
              <p>
                {format(
                  new Date(year.year, quarterIndex * 3 + monthIndex, 1),
                  "MMM",
                )}
              </p>
            )}
            title={`Q${quarterIndex + 1} ${year.year}`}
          />
        ) : null}
        {showGrid ? <GanttColumns columns={quarter.months.length} /> : null}
      </HeaderSection>
    )),
  )
}

const rangeHeaders: Record<Range, FC<RangeHeaderProps>> = {
  daily: DailyHeader,
  monthly: MonthlyHeader,
  quarterly: QuarterlyHeader,
}

export type GanttHeaderProps = {
  className?: string
  variant?: GanttHeaderVariant
}

export function GanttHeader({
  className,
  variant = "full",
}: GanttHeaderProps) {
  const gantt = useGanttContext()
  const RangeHeader = rangeHeaders[gantt.range]

  return (
    <div
      className={cn(
        "-space-x-px flex w-max divide-x divide-border/50",
        variant === "dates"
          ? "h-[var(--gantt-header-height)] shrink-0"
          : "h-full",
        className,
      )}
    >
      <RangeHeader variant={variant} />
    </div>
  )
}
