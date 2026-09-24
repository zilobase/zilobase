import { memo, useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { eventClock } from "@zilobase/features/calendar";

// Reuse formatters across the bounded visible columns and month cells.
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
function clockFormatter(zone: string) {
  let formatter = clockFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (clockFormatters.size >= 16) clockFormatters.delete(clockFormatters.keys().next().value!);
    clockFormatters.set(zone, formatter);
  }
  return formatter;
}
const columnDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthDateFormatter = new Intl.DateTimeFormat(undefined, { day: "2-digit", timeZone: "UTC" });
const monthStartFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const CalendarClock = createContext<number | null>(null);
export function CalendarClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    const refresh = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    tick();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return <CalendarClock.Provider value={now}>{children}</CalendarClock.Provider>;
}
function useCalendarClock(zone: string) {
  const now = useContext(CalendarClock) ?? Date.now();
  const formatter = clockFormatter(zone);
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    now,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    top: (Number(parts.hour) * 60 + Number(parts.minute)) * 0.8,
  };
}

export const CurrentTimeLabel = memo(function CurrentTimeLabel({
  zone,
  secondaryZones,
  timeFormat,
  hourHeight = 48,
}: {
  hourHeight?: number;
  days: string[];
  zone: string;
  secondaryZones: string[];
  timeFormat: "12" | "24";
}) {
  const clock = useCalendarClock(zone);

  return (
    <div
      data-calendar-current-time-label
      className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2"
      style={{ top: (clock.top * hourHeight) / 48 }}
    >
      {[zone, ...secondaryZones].reverse().map((value) => (
        <div key={value} className="flex w-14 justify-end pr-1">
          <span className="rounded-sm bg-action-primary px-1 py-0.5 text-[10px] text-action-on-primary">
            {eventClock(
              { dateTime: new Date(clock.now).toISOString(), timeZone: value },
              value,
              timeFormat,
            )}
          </span>
        </div>
      ))}
    </div>
  );
});

export const CalendarDateLabel = memo(function CalendarDateLabel({
  day,
  zone,
  month = false,
}: {
  day: string;
  zone: string;
  month?: boolean;
}) {
  const clock = useCalendarClock(zone);
  const formatter = month
    ? day.endsWith("-01")
      ? monthStartFormatter
      : monthDateFormatter
    : columnDateFormatter;
  const today = clock.date === day;
  return (
    <span data-calendar-today={today ? day : undefined} aria-current={today ? "date" : undefined}>
      {formatter.formatToParts(new Date(`${day}T12:00:00Z`)).map((part, index) =>
        part.type === "day" && today ? (
          <span
            key={index}
            className="inline-flex min-w-5 items-center justify-center rounded-sm bg-action-primary px-1 text-action-on-primary"
          >
            {part.value}
          </span>
        ) : (
          part.value
        ),
      )}
    </span>
  );
});

export function TimelineCurrentTime({
  days,
  columnWidth,
  zone,
  hourHeight,
  headerHeight,
}: {
  days: string[];
  columnWidth: number;
  zone: string;
  hourHeight: number;
  headerHeight: number;
}) {
  const clock = useCalendarClock(zone);
  const index = days.indexOf(clock.date);
  return (
    <div
      data-calendar-now
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20 h-px"
      style={{ top: headerHeight + (clock.top * hourHeight) / 48 }}
    >
      <span className="absolute inset-0 bg-action-primary opacity-20" />
      {index >= 0 && (
        <span
          className="absolute h-0.5 bg-action-primary"
          style={{ left: index * columnWidth, width: columnWidth }}
        />
      )}
    </div>
  );
}
