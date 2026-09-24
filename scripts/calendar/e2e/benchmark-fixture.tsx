import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  CalendarItem,
  CalendarSurfaceProps,
  CalendarView,
} from "@/shared/components/calendar";
import { eventClock } from "@zilobase/features/calendar-layout";
import "@/shared/styles/global.css";
import "@/app/styles.css";
const params = new URLSearchParams(location.search);
const baselinePath = "/.dev/calendar-baseline/shared/components/calendar/index.ts";
const { CalendarSurface } = params.has("baseline")
  ? ((await import(/* @vite-ignore */ baselinePath)) as {
      CalendarSurface: React.ComponentType<CalendarSurfaceProps>;
    })
  : await import("@/shared/components/calendar");
const count = Number(params.get("count") ?? 10000);
const items: CalendarItem[] = Array.from({ length: count }, (_, index) => ({
  id: `item-${index}`,
  title: `Meeting ${index}`,
  editable: true,
  start: {
    dateTime: new Date(
      Date.UTC(2026, 8, (index % 28) + 1, 3 + (Math.floor(index / 28) % 14), (index % 4) * 15),
    ).toISOString(),
    timeZone: "Asia/Kolkata",
  },
  end: {
    dateTime: new Date(
      Date.UTC(2026, 8, (index % 28) + 1, 4 + (Math.floor(index / 28) % 14), (index % 4) * 15),
    ).toISOString(),
    timeZone: "Asia/Kolkata",
  },
}));
const preferences = {
  timeZone: "Asia/Kolkata",
  timeFormat: "24" as const,
  weekStartsOn: 1 as const,
  showWeekends: true,
  showWeekNumbers: false,
  secondaryTimeZones: [],
};
const metrics = { cards: 0, ranges: 0 };
function Fixture() {
  const [view, setView] = useState<CalendarView>("month"),
    [date, setDate] = useState("2026-09-09"),
    [revision, setRevision] = useState(0);
  const [current, setItems] = useState(items);
  const navigate = useCallback((date: string, view: CalendarView) => {
    setDate(date);
    setView(view);
  }, []);
  const range = useCallback(() => {
    metrics.ranges++;
  }, []);
  const change = useCallback(
    (item: CalendarItem) =>
      setItems((items) => items.map((old) => (old.id === item.id ? item : old))),
    [],
  );
  const renderItem = useCallback((item: CalendarItem) => {
    metrics.cards++;
    return (
      <>
        <span className="w-full truncate font-medium">{item.title}</span>
        <span className="truncate text-[11px] opacity-80">
          {eventClock(item.start, preferences.timeZone, preferences.timeFormat)}–
          {eventClock(item.end, preferences.timeZone, preferences.timeFormat)}
        </span>
      </>
    );
  }, []);
  useEffect(() => {
    Object.assign(window, {
      surfaceFixture: {
        navigate: (view: CalendarView) => setView(view),
        refresh: () => setRevision((i) => i + 1),
        metrics,
        reset: () => {
          metrics.cards = 0;
          metrics.ranges = 0;
        },
      },
    });
  }, []);
  return (
    <main className="flex h-screen flex-col bg-surface-canvas text-content-primary">
      <output>
        {date} {view} {revision}
      </output>
      <CalendarSurface
        items={current}
        date={date}
        view={view}
        preferences={preferences}
        onNavigate={navigate}
        onRangeChange={range}
        onChange={change}
        renderItem={renderItem}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
