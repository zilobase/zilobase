import { CalendarInteractionHost } from "./calendar-interactions";
import { CalendarClockProvider } from "./current-time";
import { useTimelineWindow } from "./use-timeline-window";
import { CalendarTimeline } from "./calendar-timeline";
import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import {
  addCalendarDays,
  calendarDays,
  eventClock,
  createEventIndex,
} from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { CalendarMonthView } from "./calendar-month-view";
import { type CalendarItem, type CalendarSurfaceProps } from "./types";

export function CalendarSurface(props: CalendarSurfaceProps) {
  const {
    loadingMessage,
    zoneControls,
    items,
    date,
    view,
    preferences,
    onNavigate,
    onSelect,
    onCreate,
    onChange,
    renderItem,
  } = props;
  const timeline = useTimelineWindow(props);
  const painted = useRef(false),
    blockedRoute = useRef(false);
  markSurfacePaint(timeline.jumped, timeline.loading, painted, blockedRoute);
  const interactionItems = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const allDays = useMemo(
    () =>
      calendarDays(
        date,
        view,
        preferences.weekStartsOn,
        preferences.visibleDayCount,
        preferences.showWeekends,
        preferences.alignStart,
      ),
    [
      date,
      view,
      preferences.weekStartsOn,
      preferences.visibleDayCount,
      preferences.showWeekends,
      preferences.alignStart,
    ],
  );
  const loadedDays = timeline.days;

  const days = useMemo(
    () => allDays.filter((day) => visibleSurfaceDay(day, view, preferences.showWeekends)),
    [allDays, preferences.showWeekends, view],
  );
  const [indexEvents] = useState(() => createEventIndex<CalendarItem>());
  // A date jump can commit before the month scroller emits its replacement buffer.
  const indexedDays = loadedDays;
  const layoutDuration = useRef(0);
  const eventsByDay = useMemo(() => {
    const began = performance.now();
    const result = indexEvents(items, indexedDays, preferences.timeZone);
    layoutDuration.current = performance.now() - began;
    return result;
  }, [indexEvents, items, indexedDays, preferences.timeZone]);
  useEffect(
    () => props.onMetric?.("layout_duration", layoutDuration.current),
    [eventsByDay, props.onMetric],
  );
  const writable = useCallback(
    (item: CalendarItem) => Boolean(item.editable && onChange),
    [onChange],
  );
  const change = useCallback(
    (item: CalendarItem) => {
      if (item.editable) onChange?.(item);
    },
    [onChange],
  );
  const day = useCallback((next: string) => onNavigate(next, "day"), [onNavigate]);
  const create = useCallback(
    (day: string, hour: number, duration: number) => onCreate?.(day, hour, duration),
    [onCreate],
  );
  const card = useCallback(
    (event: CalendarItem) => surfaceEventCard(event, view, preferences, onSelect, renderItem),
    [view, onSelect, renderItem, preferences],
  );
  const content = surfaceView({
    view,
    loadingMessage,
    timeline,
    date,
    props,
    eventsByDay,
    preferences,
    onChange,
    writable,
    card,
    day,
    create,
    zoneControls,
    days,
    onItemChange: change,
  });
  if (surfaceShowsLoading(timeline.loading, painted.current, blockedRoute.current))
    return (
      <div
        role="status"
        aria-busy="true"
        className="flex min-h-0 flex-1 items-center justify-center text-sm text-content-secondary"
      >
        {loadingMessage ?? "Loading calendar…"}
      </div>
    );
  return (
    <CalendarClockProvider>
      <CalendarInteractionHost
        items={interactionItems}
        ready={timeline.ready}
        weekends={preferences.showWeekends || view === "day"}
      >
        {content}
      </CalendarInteractionHost>
    </CalendarClockProvider>
  );
}
function markSurfacePaint(
  jumped: boolean,
  loading: boolean,
  painted: { current: boolean },
  blockedRoute: { current: boolean },
) {
  if (jumped && loading) blockedRoute.current = true;
  if (!loading) {
    painted.current = true;
    blockedRoute.current = false;
  }
}
function surfaceShowsLoading(loading: boolean, painted: boolean, blocked: boolean) {
  return loading && (!painted || blocked);
}
function surfaceView(input: {
  view: CalendarSurfaceProps["view"];
  loadingMessage?: string;
  timeline: ReturnType<typeof useTimelineWindow>;
  date: string;
  props: CalendarSurfaceProps;
  eventsByDay: Record<string, CalendarItem[]>;
  preferences: CalendarSurfaceProps["preferences"];
  onChange?: CalendarSurfaceProps["onChange"];
  writable: (item: CalendarItem) => boolean;
  card: (item: CalendarItem) => React.ReactNode;
  day: (next: string) => void;
  create: (day: string, hour: number, duration: number) => void;
  zoneControls?: CalendarSurfaceProps["zoneControls"];
  days: string[];
  onItemChange: (item: CalendarItem) => void;
}) {
  const report = (first: string, last: string, retain?: boolean) => {
    input.props.onPreviewDate?.(input.view === "month" ? addCalendarDays(first, 3) : first);
    input.timeline.report(first, last, retain);
  };
  if (input.view === "month")
    return (
      <CalendarMonthView
        loadingMessage={input.loadingMessage}
        beforeLoading={input.timeline.beforeLoading}
        afterLoading={input.timeline.afterLoading}
        date={input.date}
        onDate={(next) => {
          input.timeline.markEmitted(next);
          input.props.onVisibleDateChange?.(next);
        }}
        onViewport={report}
        days={input.timeline.days}
        eventsByDay={input.eventsByDay}
        preferences={input.preferences}
        online={Boolean(input.onChange)}
        writable={input.writable}
        card={input.card}
        onDay={input.day}
        onChange={input.onItemChange}
        onError={input.props.onError}
      />
    );
  return (
    <CalendarTimeline
      onRetry={input.props.onRetryRange}
      onMetric={input.props.onMetric}
      loadingMessage={input.loadingMessage}
      beforeLoading={input.timeline.beforeLoading}
      afterLoading={input.timeline.afterLoading}
      zoneControls={input.zoneControls}
      canCreate={Boolean(input.props.onCreate)}
      days={input.timeline.days.filter((day) =>
        visibleSurfaceDay(day, input.view, input.preferences.showWeekends),
      )}
      date={input.date}
      target={input.days[0]!}
      onViewport={report}
      onVisibleDate={(next) => {
        input.timeline.markEmitted(next);
        input.props.onVisibleDateChange?.(next);
      }}
      eventsByDay={input.eventsByDay}
      preferences={{
        ...input.preferences,
        showWeekends: input.preferences.showWeekends || input.view === "day",
        visibleDayCount: input.view === "day" ? 1 : input.days.length,
      }}
      card={input.card}
      writable={input.writable}
      onDay={input.day}
      onCreate={input.create}
      onChange={input.onItemChange}
      onError={input.props.onError}
    />
  );
}
function visibleSurfaceDay(day: string, view: CalendarSurfaceProps["view"], showWeekends: boolean) {
  return (
    showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())
  );
}
function eventCardShape(event: CalendarItem, view: CalendarSurfaceProps["view"]) {
  if (!event.start.date && (view === "day" || view === "week"))
    return "h-full flex-col items-start gap-0.5 rounded-md border border-current p-2";
  if (event.start.date && (view === "day" || view === "week"))
    return "h-auto rounded-none px-1.5 py-1";
  return "h-auto rounded-sm px-1.5 py-1";
}
function eventCardClass(event: CalendarItem, view: CalendarSurfaceProps["view"]) {
  const timed = !event.start.date && (view === "day" || view === "week");
  return `${eventCardShape(event, view)} ${timed && event.dashed ? "border-dashed" : ""} w-full justify-start overflow-hidden text-left text-xs font-normal ${event.backgroundClass ?? "bg-surface-canvas"} ${event.textClass ?? "text-content-primary"}`;
}
function surfaceEventCard(
  event: CalendarItem,
  view: CalendarSurfaceProps["view"],
  preferences: CalendarSurfaceProps["preferences"],
  onSelect?: CalendarSurfaceProps["onSelect"],
  renderItem?: CalendarSurfaceProps["renderItem"],
) {
  return (
    <Button
      key={event.id}
      data-calendar-event-card
      data-calendar-event-id={event.id}
      variant="ghost"
      className={eventCardClass(event, view)}
      onClick={() => onSelect?.(event)}
      title={event.title}
    >
      {renderItem ? (
        renderItem(event)
      ) : (
        <>
          <span className="w-full truncate font-medium">{event.title}</span>
          {!event.start.date && (
            <span className="truncate text-[11px] opacity-80">
              {eventClock(event.start, preferences.timeZone, preferences.timeFormat)}–
              {eventClock(event.end, preferences.timeZone, preferences.timeFormat)}
            </span>
          )}
        </>
      )}
    </Button>
  );
}
