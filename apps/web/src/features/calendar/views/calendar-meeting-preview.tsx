import { createCalendarSelectionMatcher } from "../connections/calendar-selection";
import { useEffect, useMemo, useState } from "react";
import {
  addCalendarDays,
  dayInstant,
  eventClock,
  todayInZone,
  upcomingCalendarMeeting,
  type CalendarConnection,
  type CalendarEvent,
  type CalendarPreferences,
} from "@zilobase/features/calendar";
import { useCalendarCache } from "../sync/use-calendar-cache";
import { Button } from "@/shared/ui/button";

function Source({
  connection,
  userId,
  preferences,
  now,
  report,
  isVisible,
}: {
  connection: CalendarConnection;
  userId: string;
  now: number;
  preferences: CalendarPreferences;
  report: (binding: string, event?: CalendarEvent) => void;
  isVisible: ReturnType<typeof createCalendarSelectionMatcher>["isVisible"];
}) {
  const day = todayInZone(preferences.timeZone);
  const cache = useCalendarCache(
    connection,
    userId,
    dayInstant(day, preferences.timeZone),
    dayInstant(addCalendarDays(day, 2), preferences.timeZone),
  );
  const candidate = upcomingCalendarMeeting(
    (cache.events ?? []).filter((event) => isVisible(event.bindingId, event.calendarId)),
    now,
    preferences.meetingPreviewMinutes ?? 15,
  );
  useEffect(
    () => report(connection.bindingId, candidate),
    [report, connection.bindingId, candidate],
  );
  return null;
}

export function CalendarMeetingPreview({
  connections,
  userId,
  preferences,
  onSelect,
}: {
  connections: CalendarConnection[];
  userId: string;
  preferences: CalendarPreferences;
  onSelect: (event: CalendarEvent) => void;
}) {
  const [now, setNow] = useState(Date.now);
  const [candidates, setCandidates] = useState<Record<string, CalendarEvent | undefined>>({});
  const [report] = useState(
    () => (binding: string, event?: CalendarEvent) =>
      setCandidates((current) =>
        current[binding] === event ? current : { ...current, [binding]: event },
      ),
  );
  useEffect(() => {
    const refresh = () => setNow(Date.now()),
      timer = setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const calendarMatcher = useMemo(
    () => createCalendarSelectionMatcher(preferences),
    [preferences.hiddenCalendarKeys, preferences.removedCalendarKeys],
  );
  const next = upcomingCalendarMeeting(
    connections
      .flatMap((connection) =>
        candidates[connection.bindingId] ? [candidates[connection.bindingId]!] : [],
      )
      .filter((event) => calendarMatcher.isVisible(event.bindingId, event.calendarId)),
    now,
    preferences.meetingPreviewMinutes ?? 15,
  );
  return (
    <>
      {connections.map((connection) => (
        <Source
          key={connection.bindingId}
          connection={connection}
          userId={userId}
          preferences={preferences}
          now={now}
          report={report}
          isVisible={calendarMatcher.isVisible}
        />
      ))}
      {next && (
        <section
          aria-label="Upcoming meeting"
          className="grid gap-2 border-b border-stroke-default pb-3"
        >
          <h3 className="font-medium">Upcoming meeting</h3>
          <Button
            variant="outline"
            className="h-auto justify-start whitespace-normal text-left"
            onClick={() => onSelect(next)}
          >
            {eventClock(next.start, preferences.timeZone, preferences.timeFormat)} · {next.title}
          </Button>
        </section>
      )}
    </>
  );
}
