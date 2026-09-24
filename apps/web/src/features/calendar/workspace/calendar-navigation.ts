import { useCallback, useEffect, useRef, useState } from "react";
import {
  addCalendarDays,
  calendarDays,
  dayInstant,
  todayInZone,
  type CalendarPreferences,
  type CalendarView,
} from "@zilobase/features/calendar";
import { type CalendarWindow } from "../sync/range-coverage";
export type CalendarDestination = {
  date: string;
  view: CalendarView;
  days?: number;
  align?: boolean;
};
/** Chrome (toolbar, mini-calendar, heading) follows settled viewport, then the route, then today. */
export function chromeCalendarDate(
  visibleDate: string | null | undefined,
  routeDate: string | undefined,
  zone: string,
) {
  return visibleDate ?? routeDate ?? todayInZone(zone);
}
/** Bookmark writes of the settled date must not copy the route into the jump target. */
function calendarRouteRetargets(routeDate: string | undefined, bookmarkDate: string | null) {
  return Boolean(routeDate) && routeDate !== bookmarkDate;
}
/** Jump target stays on explicit navigation; chrome date follows the viewport. */
export function useCalendarVisibleDate(
  routeDate: string,
  searchDate: string | undefined,
  zone: string,
  visibleDate: string | null,
  setVisibleDate: (date: string) => void,
) {
  const [anchorDate, setAnchorDate] = useState(routeDate);
  const lastBookmark = useRef<string | null>(null);
  const anchorRef = useRef(anchorDate);
  anchorRef.current = anchorDate;
  const date = chromeCalendarDate(visibleDate, searchDate, zone);
  useEffect(() => {
    if (!visibleDate) setVisibleDate(anchorDate);
  }, []);
  useEffect(() => {
    if (
      !calendarRouteRetargets(searchDate, lastBookmark.current) ||
      !searchDate ||
      searchDate === anchorRef.current
    )
      return;
    lastBookmark.current = null;
    setAnchorDate(searchDate);
    setVisibleDate(searchDate);
  }, [searchDate, setVisibleDate]);
  const markExplicit = useCallback(
    (next: string) => {
      lastBookmark.current = null;
      setAnchorDate(next);
      setVisibleDate(next);
    },
    [setVisibleDate],
  );
  const markBookmark = useCallback(
    (next: string) => {
      lastBookmark.current = next;
      setVisibleDate(next);
    },
    [setVisibleDate],
  );
  return { anchorDate, date, lastBookmark, markExplicit, markBookmark };
}
export function calendarDestinationRange(
  next: CalendarDestination,
  preferences: CalendarPreferences,
): CalendarWindow {
  const days = calendarDays(
    next.date,
    next.view,
    preferences.weekStartsOn,
    next.days,
    preferences.showWeekends,
    next.align,
  );
  // Month opens at its first week; reserve enough weeks for a tall viewport.
  const last =
    next.view === "month"
      ? addCalendarDays(
          days[0]!,
          Math.max(
            42,
            typeof window === "undefined" ? 42 : Math.ceil(window.innerHeight / 144) * 7,
          ),
        )
      : addCalendarDays(days.at(-1)!, 1);
  return {
    start: dayInstant(days[0]!, preferences.timeZone),
    end: dayInstant(last, preferences.timeZone),
  };
}
/** One latest destination; callbacks only run after materialized coverage is ready. */
export function useCalendarNavigation({
  ready,
  online,
  error,
  initial,
  retry,
}: {
  ready: (range: CalendarWindow) => boolean;
  online: boolean;
  error?: unknown;
  initial: CalendarWindow;
  retry: () => void;
}) {
  const [target, setTarget] = useState<CalendarWindow | null>(initial);
  const [pending, setPending] = useState(false);
  const action = useRef<(() => void) | null>(null);
  const state = useRef({ ready, online, error });
  state.current = { ready, online, error };
  const request = useCallback((range: CalendarWindow, commit: () => void) => {
    action.current = commit;
    if (state.current.ready(range)) {
      action.current = null;
      setPending(false);
      setTarget(null);
      commit();
      return;
    }
    setTarget((current) =>
      current?.start === range.start && current.end === range.end ? current : range,
    );
    setPending(true);
  }, []);
  useEffect(() => {
    if (!pending || !target || !ready(target)) return;
    const commit = action.current;
    action.current = null;
    setPending(false);
    setTarget(null);
    commit?.();
  }, [pending, target, ready]);
  const cancel = useCallback(() => {
    action.current = null;
    setPending(false);
    setTarget(null);
  }, []);
  return {
    target,
    pending,
    request,
    cancel,
    retry,
    error: pending
      ? !online
        ? new Error("These dates are not cached. Connect to load them.")
        : error
      : undefined,
  };
}
