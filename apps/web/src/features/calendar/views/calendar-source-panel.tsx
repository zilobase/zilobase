import { useState } from "react";
import { createPortal } from "react-dom";
import {
  addCalendarDays,
  dayInstant,
  todayInZone,
  eventClock,
  eventInstant,
  type CalendarConnection,
  type CalendarEvent,
  type CalendarPreferences,
  type CalendarRecord,
} from "@zilobase/features/calendar";
import { useCalendarWorkspace } from "../workspace/calendar-workspace";
import { useCalendarCache } from "../sync/use-calendar-cache";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";
import { CalendarList } from "../connections/calendar-list";
import { Button } from "@/shared/ui/button";
import { getApiErrorMessage } from "@/platform/network/api";

export function CalendarSourcePanel({
  connection,
  calendar,
  allCalendars,
  userId,
  preferences,
  preferenceWorkspaceId,
  onSelect,
  onCreate,
}: {
  connection: CalendarConnection;
  calendar: CalendarRecord;
  allCalendars: CalendarRecord[];
  userId: string;
  preferences: CalendarPreferences;
  preferenceWorkspaceId: string;
  onSelect: (event: CalendarEvent) => void;
  onCreate: () => void;
}) {
  const workspace = useCalendarWorkspace(),
    settings = useCalendarPreferences(preferenceWorkspaceId);
  const [page, setPage] = useState(0),
    [showSettings, setShowSettings] = useState(false);
  const [anchor] = useState(() => todayInZone(preferences.timeZone));
  const start = addCalendarDays(anchor, page * 30),
    end = addCalendarDays(start, 30);
  const cache = useCalendarCache(
    connection,
    userId,
    dayInstant(start, preferences.timeZone),
    dayInstant(end, preferences.timeZone),
  );
  const events = sourcePanelEvents(cache.events ?? [], calendar.id, preferences);
  return createPortal(
    <section
      data-calendar-event-panel
      className="flex h-full min-h-0 flex-col"
      aria-label={`${calendar.name} upcoming events`}
      inert={!workspace.panelOpen || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          workspace.closePanel();
        }
      }}
    >
      <header className="flex items-center gap-2 border-b border-stroke-default p-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{calendar.name}</h2>
        <Button variant="ghost" size="sm" onClick={workspace.closePanel}>
          Close
        </Button>
      </header>
      <div className="flex gap-2 p-3">
        <Button disabled={!cache.online || !calendar.permissions.write} onClick={onCreate}>
          Create event
        </Button>
        <Button
          variant="outline"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((value) => !value)}
        >
          Calendar options
        </Button>
      </div>
      {showSettings && (
        <div className="border-b border-stroke-default p-2">
          <CalendarList
            calendars={[calendar]}
            allCalendars={allCalendars}
            preferences={settings.query.data ?? preferences}
            disabled={settings.pending}
            onPreferences={(value) => settings.save.mutateAsync(value)}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-3 text-xs">
        <Button
          size="sm"
          variant="ghost"
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous 30 days
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPage((value) => value + 1)}>
          Next 30 days
        </Button>
      </div>
      <p className="px-3 py-2 text-xs text-content-secondary" role="status">
        {start} – {addCalendarDays(end, -1)}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {cache.error ? (
          <div role="alert">
            <p>{getApiErrorMessage(cache.error)}</p>
            <Button variant="outline" onClick={() => void cache.refresh()}>
              Retry
            </Button>
          </div>
        ) : null}
        <SourceEventList
          events={events}
          loaded={Boolean(cache.loaded)}
          preferences={preferences}
          onSelect={onSelect}
        />
      </div>
    </section>,
    workspace.panelElement,
  );
}
function sourcePanelEvents(
  events: CalendarEvent[],
  calendarId: string,
  preferences: CalendarPreferences,
) {
  return events
    .filter(
      (event) =>
        event.calendarId === calendarId &&
        event.status !== "cancelled" &&
        visibleSourceEvent(event, preferences),
    )
    .sort(
      (a, b) =>
        Date.parse(eventInstant(a.start, preferences.timeZone)) -
        Date.parse(eventInstant(b.start, preferences.timeZone)),
    );
}
function visibleSourceEvent(event: CalendarEvent, preferences: CalendarPreferences) {
  return (
    preferences.showDeclined ||
    !event.attendees.some((attendee) => attendee.self && attendee.responseStatus === "declined")
  );
}
function SourceEventList({
  events,
  loaded,
  preferences,
  onSelect,
}: {
  events: CalendarEvent[];
  loaded: boolean;
  preferences: CalendarPreferences;
  onSelect: (event: CalendarEvent) => void;
}) {
  if (!loaded && !events.length) return <p>Loading events…</p>;
  if (!events.length)
    return <p className="text-sm text-content-secondary">No events in this period.</p>;
  return (
    <ul className="grid gap-2">
      {events.map((event) => (
        <li key={event.eventId}>
          <Button
            className="h-auto w-full justify-start whitespace-normal text-left"
            variant="ghost"
            onClick={() => onSelect(event)}
          >
            <span>
              <span className="block">{event.title}</span>
              <span className="block text-xs text-content-secondary">
                {event.start.date ??
                  new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeZone: preferences.timeZone,
                  }).format(new Date(event.start.dateTime))}{" "}
                · {eventClock(event.start, preferences.timeZone, preferences.timeFormat)}
              </span>
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
