import { civilDayOrdinal, addCalendarDays, calendarDays } from "@zilobase/features/calendar";
import { CalendarDateLabel } from "./current-time";
import { CalendarOverflow } from "./calendar-overflow";
import { calendarItemKey, type CalendarItem, type CalendarDisplayPreferences } from "./types";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getISOWeek } from "date-fns";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { DraggableEvent } from "./draggable-event";
import { CALENDAR_SNAP_ANIMATION_MS, useCalendarWheelScroll } from "./use-calendar-wheel-scroll";

type MonthProps = { onError?: (error: Error) => void; days: string[]; eventsByDay: Record<string, CalendarItem[]>; preferences: CalendarDisplayPreferences; online: boolean; writable: (event: CalendarItem) => boolean; card: (event: CalendarItem) => ReactNode; onDay: (day: string) => void; onChange: (event: CalendarItem) => void };

function weekBars(days: string[], eventsByDay: MonthProps["eventsByDay"]) {
  const events = [...new Map(days.flatMap(day => eventsByDay[day] ?? []).map(event => [calendarItemKey(event), event])).values()];
  const rows: number[] = [];
  const membership = days.map(day => new Set((eventsByDay[day] ?? []).map(calendarItemKey)));
  return events.map(event => {
    const key = calendarItemKey(event);
    const included = membership.map((set, index) => set.has(key) ? index : -1).filter(index => index >= 0);
    const start = included[0]!, end = included.at(-1)!, mask = included.reduce((bits, index) => bits | 1 << index, 0);
    let lane = rows.findIndex(row => !(row & mask)); if (lane < 0) lane = rows.length;
    rows[lane] = (rows[lane] ?? 0) | mask;
    return { event, start, end, lane };
  });
}

const CalendarMonthWeek = memo(function CalendarMonthWeek(props: MonthProps) {
  const { days, eventsByDay, card, onDay, preferences, onChange } = props, container = useRef<HTMLDivElement>(null);
  const bars = useMemo(() => weekBars(days, eventsByDay), [days, eventsByDay]);
  return <div data-calendar-columns={days.length} ref={container} className="relative grid h-36 border-b border-stroke-default" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: "32px repeat(3, 26px) 26px" }}>
    {days.map((day, index) => <div key={day} className="border-r border-stroke-default" style={{ gridColumn: index + 1, gridRow: "1 / 6" }}><Button size="sm" variant="ghost" onClick={() => onDay(day)}><CalendarDateLabel day={day} zone={preferences.timeZone} month />{preferences.showWeekNumbers && index === 0 && <span className="ml-1 text-[10px] text-content-secondary">W{getISOWeek(new Date(`${day}T12:00:00Z`))}</span>}</Button></div>)}
    {bars.filter(bar => bar.lane < 3).map(bar => <div key={calendarItemKey(bar.event)} className="z-10 min-w-0 px-0.5" style={{ gridColumn: `${bar.start + 1} / span ${bar.end - bar.start + 1}`, gridRow: bar.lane + 2 }}><DraggableEvent onError={props.onError} event={bar.event} zone={preferences.timeZone} resizable={Boolean(bar.event.start.date)} disabled={!props.online || !props.writable(bar.event)} onChange={onChange}>{card(bar.event)}</DraggableEvent></div>)}
    {days.map((day, index) => { const hidden = bars.filter(bar => bar.lane >= 3 && bar.start <= index && bar.end >= index); return hidden.length ? <div key={day} className="z-10 min-w-0" style={{ gridColumn: index + 1, gridRow: 5 }}><Popover><PopoverTrigger asChild><Button size="sm" variant="ghost">+{hidden.length} more</Button></PopoverTrigger><PopoverContent className="max-h-80 overflow-auto"><CalendarOverflow items={eventsByDay[day] ?? []} card={card} /></PopoverContent></Popover></div> : null; })}
  </div>;
}, (a, b) => a.days === b.days && a.days.every(day => a.eventsByDay[day] === b.eventsByDay[day]) && a.preferences === b.preferences && a.online === b.online && a.writable === b.writable && a.card === b.card && a.onDay === b.onDay && a.onChange === b.onChange && a.onError === b.onError);

const WEEK_HEIGHT = 144;
const BASE_BUFFER_ROWS = 2;

/** Month rows use calendarcn's translated-buffer wheel model while retaining Zilobase's week cells and event rendering. */
export function CalendarMonthView(props: MonthProps & { loadingMessage?: string; beforeLoading: boolean; afterLoading: boolean; date: string; onDate: (date: string) => void; onViewport: (first: string, last: string, retain?: boolean) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(WEEK_HEIGHT * 6);
  const [focused, setFocused] = useState<string | null>(null);

  // Only complete weeks enter the physical extent; week identity includes hidden weekends.
  const offset = (new Date(`${props.days[0]}T12:00:00Z`).getUTCDay() - props.preferences.weekStartsOn + 7) % 7;
  const first = addCalendarDays(props.days[0]!, offset ? 7 - offset : 0);
  const count = Math.max(1, Math.floor((civilDayOrdinal(props.days.at(-1)!) - civilDayOrdinal(first) + 1) / 7));
  const weeks = useMemo(() => Array.from({ length: count }, (_, index) => Array.from({ length: 7 }, (_, day) => addCalendarDays(first, index * 7 + day))), [count, first]);
  const requestedWeek = calendarDays(props.date, "month", props.preferences.weekStartsOn)[0]!;
  const [anchor, setAnchor] = useState(requestedWeek);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const loadedWeeksRef = useRef(weeks);
  loadedWeeksRef.current = weeks;
  const visibleRows = Math.max(1, Math.ceil(viewportHeight / WEEK_HEIGHT));

  const navigateFromScroll = useCallback((rowsDelta: number) => {
    const next = addCalendarDays(anchorRef.current, rowsDelta * 7);
    if (next === anchorRef.current || !loadedWeeksRef.current.some(week => week[0] === next)) return;
    anchorRef.current = next;
    setAnchor(next);
    props.onDate(addCalendarDays(next, 3));
  }, [props.onDate]);

  const { scrollOffset, slideOffset, isAnimating, triggerSlideAnimation } = useCalendarWheelScroll({
    containerRef: viewport,
    itemSize: WEEK_HEIGHT,
    axis: "vertical",
    onNavigate: navigateFromScroll,
  });

  const previousRequestedWeek = useRef(requestedWeek);
  useEffect(() => {
    if (previousRequestedWeek.current === requestedWeek) return;
    const rowsDelta = (civilDayOrdinal(requestedWeek) - civilDayOrdinal(anchorRef.current)) / 7;
    previousRequestedWeek.current = requestedWeek;
    anchorRef.current = requestedWeek;
    setAnchor(requestedWeek);
    triggerSlideAnimation(rowsDelta);
  }, [requestedWeek, triggerSlideAnimation]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    setViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  const rowsDelta = Math.round(-scrollOffset / WEEK_HEIGHT);
  const visibleFirst = addCalendarDays(anchor, rowsDelta * 7);
  const visibleLast = addCalendarDays(visibleFirst, (visibleRows - 1) * 7);
  useEffect(() => {
    props.onViewport(visibleFirst, addCalendarDays(visibleLast, 6), true);
  }, [props.onViewport, visibleFirst, visibleLast]);

  const extraRows = Math.ceil(Math.abs(scrollOffset) / WEEK_HEIGHT);
  const buffer = BASE_BUFFER_ROWS + extraRows;
  const loadedLast = weeks.at(-1)![0]!;
  const displayFirst = addCalendarDays(civilDayOrdinal(first) < civilDayOrdinal(visibleFirst) ? first : visibleFirst, -buffer * 7);
  const displayLast = addCalendarDays(civilDayOrdinal(loadedLast) > civilDayOrdinal(visibleLast) ? loadedLast : visibleLast, buffer * 7);
  const displayCount = Math.max(1, (civilDayOrdinal(displayLast) - civilDayOrdinal(displayFirst)) / 7 + 1);
  const displayWeeks = useMemo(() => Array.from({ length: displayCount }, (_, index) => Array.from({ length: 7 }, (_, day) => addCalendarDays(displayFirst, index * 7 + day))), [displayCount, displayFirst]);
  const anchorIndex = (civilDayOrdinal(anchor) - civilDayOrdinal(displayFirst)) / 7;
  const mountedIndices = useMemo(() => {
    const visibleStart = (civilDayOrdinal(visibleFirst) - civilDayOrdinal(displayFirst)) / 7;
    const visibleEnd = (civilDayOrdinal(visibleLast) - civilDayOrdinal(displayFirst)) / 7;
    const start = Math.max(0, visibleStart - buffer);
    const end = Math.min(displayWeeks.length - 1, visibleEnd + buffer);
    const result = Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
    const focusedIndex = focused ? displayWeeks.findIndex(week => week[0] === focused) : -1;
    if (focusedIndex >= 0 && !result.includes(focusedIndex)) result.push(focusedIndex);
    return result.sort((a, b) => a - b);
  }, [buffer, displayFirst, displayWeeks, focused, visibleFirst, visibleLast]);

  const transformY = -anchorIndex * WEEK_HEIGHT + scrollOffset + slideOffset;
  const edgeBefore = civilDayOrdinal(visibleFirst) <= civilDayOrdinal(first);
  const edgeAfter = civilDayOrdinal(visibleLast) >= civilDayOrdinal(loadedLast);

  return <div className="relative min-h-0 flex-1">
    <div
      data-calendar-scroll
      data-calendar-month-scroll
      data-calendar-scroll-anchor={anchor}
      data-calendar-scroll-offset={scrollOffset}
      ref={viewport}
      onFocusCapture={event => setFocused((event.target as HTMLElement).closest<HTMLElement>("[data-calendar-week]")?.dataset.calendarWeek ?? null)}
      className="h-full overflow-hidden overscroll-none [overflow-anchor:none]"
    >
      <div
        data-calendar-scroll-content="vertical"
        className="relative"
        style={{
          height: displayWeeks.length * WEEK_HEIGHT,
          transform: `translateY(${transformY}px)`,
          transition: isAnimating ? `transform ${CALENDAR_SNAP_ANIMATION_MS}ms ease-out` : "none",
        }}
      >
        {mountedIndices.map(index => <div key={displayWeeks[index]![0]} data-calendar-week={displayWeeks[index]![0]} className="absolute inset-x-0 top-0" style={{ transform: `translateY(${index * WEEK_HEIGHT}px)` }}><CalendarMonthWeek {...props} days={displayWeeks[index]!.filter(day => props.preferences.showWeekends || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()))} /></div>)}
      </div>
    </div>
    {props.beforeLoading && edgeBefore && <div role="status" className="pointer-events-none absolute left-1 top-1 text-xs text-content-secondary">{props.loadingMessage ?? "Loading earlier dates…"}</div>}
    {props.afterLoading && edgeAfter && <div role="status" className="pointer-events-none absolute bottom-1 right-1 text-xs text-content-secondary">{props.loadingMessage ?? "Loading later dates…"}</div>}
  </div>;
}
