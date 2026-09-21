import { TimelineCurrentTime } from "./current-time";
import { ChevronDownIcon, ChevronUpIcon } from "@/shared/components/icons";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDayColumn, type CalendarColumnActions } from "./calendar-day-column";
import { TimeAxis } from "./calendar-time-axis";
import type { CalendarItem } from "./types";
import { CALENDAR_SNAP_ANIMATION_MS, useCalendarWheelScroll } from "./use-calendar-wheel-scroll";
import { dateFromRank, visibleDateRank } from "@zilobase/features/calendar";

type TimelineProps = CalendarColumnActions & {
  days: string[];
  date: string;
  target: string;
  eventsByDay: Record<string, CalendarItem[]>;
  zoneControls?: ReactNode;
  onMetric?: (name: "mounted_columns", value: number) => void;
  onRetry?: () => void;
  onViewport: (first: string, last: string, retain?: boolean) => void;
  beforeLoading: boolean;
  afterLoading: boolean;
  loadingMessage?: string;
  onVisibleDate: (date: string) => void;
};

const EMPTY: CalendarItem[] = [];

function TimelineHeaderRail({
  rail,
  headerHeight,
  zoneControls,
  collapsed,
  onToggleCollapse,
  allDayToggleRef,
  target,
  days,
  preferences,
}: {
  rail: number;
  headerHeight: number;
  zoneControls?: ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
  allDayToggleRef: React.RefObject<HTMLButtonElement | null>;
  target: string;
  days: string[];
  preferences: TimelineProps["preferences"];
}) {
  return (
    <div className="sticky left-0 z-30 shrink-0 bg-surface-canvas" style={{ width: rail }}>
      <div className="sticky top-0 z-40 bg-surface-canvas" style={{ height: headerHeight }}>
        <div className="h-8">{zoneControls}</div>
        <button
          ref={allDayToggleRef}
          type="button"
          className="flex w-full items-center justify-center border-y border-stroke-default text-content-secondary hover:bg-surface-muted hover:text-content-primary transition-colors"
          style={{ height: headerHeight - 32 }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand all-day events" : "Collapse all-day events"}
          title={collapsed ? "Expand all-day events" : "Collapse all-day events"}
          onClick={onToggleCollapse}
        >
          {collapsed ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
        </button>
      </div>
      <div style={{ paddingLeft: 24 }}>
        <TimeAxis day={target} days={days} preferences={preferences} />
      </div>
    </div>
  );
}

/**
 * Timed calendar with calendarcn-style horizontal wheel navigation. The date
 * columns move as a translated buffer while the hour axis keeps native vertical
 * scrolling, so trackpad momentum cannot start competing browser snap cycles.
 */
export function CalendarTimeline({ days, target, eventsByDay, zoneControls, onViewport, beforeLoading, afterLoading, loadingMessage, onVisibleDate, onMetric, onRetry, ...actions }: TimelineProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const allDayToggle = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(900);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(800);
  const [collapsed, collapse] = useState(true);
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(target);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  const preferences = actions.preferences;
  const hourHeight = preferences.hourHeight;
  const headerHeight = 32 + (collapsed ? 24 : 96);
  const rail = 24 + 56 * preferences.timeZoneColumns.length;
  const visibleCount = Math.max(1, preferences.visibleDayCount ?? 7);
  const columnWidth = Math.max(1, (width - rail) / visibleCount);
  const weekdays = preferences.showWeekends;
  const rank = useCallback((day: string) => visibleDateRank(day, weekdays), [weekdays]);
  const dayAt = useCallback((value: number) => dateFromRank(value, weekdays), [weekdays]);
  const loadedDaysRef = useRef(days);
  loadedDaysRef.current = days;

  const navigateFromScroll = useCallback((daysDelta: number) => {
    const next = dayAt(rank(anchorRef.current) + daysDelta);
    // The translated buffer can preview unloaded dates, but cache readiness still
    // owns whether navigation commits (including while offline).
    if (next === anchorRef.current || !loadedDaysRef.current.includes(next)) return;
    anchorRef.current = next;
    setAnchor(next);
    onVisibleDate(next);
  }, [dayAt, onVisibleDate, rank]);

  const { scrollOffset, slideOffset, isAnimating, triggerSlideAnimation } = useCalendarWheelScroll({
    containerRef: viewport,
    itemSize: columnWidth,
    axis: "horizontal",
    onNavigate: navigateFromScroll,
  });

  const previousTarget = useRef(target);
  useEffect(() => {
    if (previousTarget.current === target) return;
    const daysDelta = rank(target) - rank(anchorRef.current);
    previousTarget.current = target;
    anchorRef.current = target;
    setAnchor(target);
    triggerSlideAnimation(daysDelta);
  }, [rank, target, triggerSlideAnimation]);

  const scrollDaysDelta = columnWidth > 0 ? Math.round(-scrollOffset / columnWidth) : 0;
  const visibleFirstRank = rank(anchor) + scrollDaysDelta;
  const visibleLastRank = visibleFirstRank + visibleCount - 1;
  const visibleFirst = dayAt(visibleFirstRank);
  const visibleLast = dayAt(visibleLastRank);

  useEffect(() => {
    onViewport(visibleFirst, visibleLast, true);
  }, [onViewport, visibleFirst, visibleLast]);

  const gestureColumns = columnWidth > 0 ? Math.ceil(Math.max(Math.abs(scrollOffset), Math.abs(slideOffset)) / columnWidth) : 0;
  // The visible columns are complete at rest; wheel/button transitions mount
  // exactly the additional columns they expose.
  const buffer = gestureColumns;
  const displayFirstRank = Math.min(rank(days[0]!), visibleFirstRank) - buffer;
  const displayLastRank = Math.max(rank(days.at(-1)!), visibleLastRank) + buffer;
  const displayDays = useMemo(() => Array.from(
    { length: displayLastRank - displayFirstRank + 1 },
    (_, index) => dayAt(displayFirstRank + index),
  ), [dayAt, displayFirstRank, displayLastRank]);
  const anchorIndex = rank(anchor) - displayFirstRank;
  const mountedIndices = useMemo(() => {
    const first = Math.max(0, visibleFirstRank - displayFirstRank - buffer);
    const last = Math.min(displayDays.length - 1, visibleLastRank - displayFirstRank + buffer);
    const result = Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
    const focusedIndex = focusedDay ? displayDays.indexOf(focusedDay) : -1;
    if (focusedIndex >= 0 && !result.includes(focusedIndex)) result.push(focusedIndex);
    return result.sort((a, b) => a - b);
  }, [buffer, displayDays, displayFirstRank, focusedDay, visibleFirstRank, visibleLastRank]);
  useEffect(() => onMetric?.("mounted_columns", mountedIndices.length), [mountedIndices.length, onMetric]);

  const previousHourHeight = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const old = previousHourHeight.current;
    element.scrollTop = old === null ? 7 * hourHeight : old === hourHeight ? element.scrollTop : element.scrollTop / old * hourHeight;
    previousHourHeight.current = hourHeight;
    setTop(element.scrollTop);
  }, [hourHeight]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth);
      setHeight(element.clientHeight);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  const transformX = -anchorIndex * columnWidth + scrollOffset + slideOffset;
  const edgeBefore = visibleFirstRank <= rank(days[0]!);
  const edgeAfter = visibleLastRank >= rank(days.at(-1)!);

  return <div className="relative min-h-0 flex-1">
    <div
      ref={viewport}
      data-calendar-scroll
      data-calendar-timeline-scroll
      data-calendar-rail-width={rail}
      data-calendar-scroll-anchor={anchor}
      data-calendar-scroll-offset={scrollOffset}
      onFocusCapture={event => setFocusedDay((event.target as HTMLElement).closest<HTMLElement>("[data-calendar-day-column]")?.dataset.calendarDayColumn ?? null)}
      className="h-full overflow-y-auto overflow-x-hidden overscroll-none [overflow-anchor:none] [scrollbar-gutter:stable]"
      onScroll={event => {
        const next = event.currentTarget.scrollTop;
        setTop(current => Math.abs(current - next) > hourHeight * 1.5 ? next : current);
      }}
    >
      <div className="relative flex" style={{ minHeight: headerHeight + hourHeight * 24 }}>
        <TimelineHeaderRail
          rail={rail}
          headerHeight={headerHeight}
          zoneControls={zoneControls}
          collapsed={collapsed}
          onToggleCollapse={() => collapse(!collapsed)}
          allDayToggleRef={allDayToggle}
          target={anchor}
          days={displayDays}
          preferences={preferences}
        />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div
            data-calendar-scroll-content="horizontal"
            className="relative"
            style={{
              width: displayDays.length * columnWidth,
              height: headerHeight + hourHeight * 24,
              transform: `translateX(${transformX}px)`,
              transition: isAnimating ? `transform ${CALENDAR_SNAP_ANIMATION_MS}ms ease-out` : "none",
            }}
          >
            <TimelineCurrentTime days={displayDays} columnWidth={columnWidth} zone={preferences.timeZone} hourHeight={hourHeight} headerHeight={headerHeight} />
            {mountedIndices.map(index => (
              <div key={displayDays[index]} className="absolute top-0" style={{ left: index * columnWidth, width: columnWidth, height: headerHeight + hourHeight * 24 }}>
                <CalendarDayColumn
                  {...actions}
                  day={displayDays[index]!}
                  items={eventsByDay[displayDays[index]!] ?? EMPTY}
                  allDayCollapsed={collapsed}
                  onExpandAllDay={() => { collapse(false); allDayToggle.current?.focus(); }}
                  viewportTop={top}
                  viewportHeight={height}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    <TimelineEdge label={loadingMessage ?? "← Loading"} show={beforeLoading && edgeBefore} loadingMessage={loadingMessage} onRetry={onRetry} className="absolute bottom-1 left-1 max-w-48 truncate text-xs text-content-secondary" />
    <TimelineEdge label={loadingMessage ?? "Loading →"} show={afterLoading && edgeAfter} loadingMessage={loadingMessage} onRetry={onRetry} className="absolute bottom-1 right-1 max-w-48 truncate text-xs text-content-secondary" />
  </div>;
}

function TimelineEdge({ label, show, loadingMessage, onRetry, className }: { label: string; show: boolean; loadingMessage?: string; onRetry?: () => void; className: string }) {
  if (!show) return null;
  return <div role="status" className={className}>{label}{loadingMessage && onRetry && <button type="button" className="ml-2 underline" onClick={onRetry}>Retry</button>}</div>;
}
