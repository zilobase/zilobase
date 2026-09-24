import { calendarLocationUrl } from "@zilobase/features/calendar";
import { useState, type ReactNode } from "react";
import {
  eventClock,
  eventInstant,
  type CalendarEvent,
  type CalendarRecord,
  type CalendarAttendee,
} from "@zilobase/features/calendar";
import type { CalendarDatabase } from "../storage/calendar-database";
import { Button } from "@/shared/ui/button";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import {
  Clock,
  Globe2Icon,
  RotateCwIcon,
  UsersIcon,
  Video,
  MapPin,
  Bell,
  CalendarIcon,
  ArrowUpRightIcon,
} from "@/shared/components/icons";
import { EventActions } from "../events/event-actions";

type Props = {
  selected: CalendarEvent;
  database: CalendarDatabase | null;
  calendars: CalendarRecord[];
  mapsProvider?: "google" | "apple";
  online: boolean;
  zone: string;
  timeFormat: "12" | "24";
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
};
function Section({ children }: { children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-stroke-default px-3 py-3 last:border-0">
      {children}
    </section>
  );
}
function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-content-secondary [&>svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
const responseLabel = {
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Maybe",
  needsAction: "Awaiting response",
};
function Participant({ attendee }: { attendee: CalendarAttendee }) {
  const name = attendee.displayName || attendee.email;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar size="sm">
        <AvatarFallback gradientSeed={attendee.email}>
          {name.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate" title={attendee.email}>
          {name}
          {attendee.self ? " (you)" : ""}
        </p>
        <p className="text-xs/relaxed text-content-secondary">
          {attendee.organizer ? "Organiser · " : ""}
          {responseLabel[attendee.responseStatus]}
        </p>
      </div>
    </div>
  );
}
function eventDurationLabel(event: CalendarEvent, zone: string) {
  const minutes = Math.round(
    (Date.parse(eventInstant(event.end, zone)) - Date.parse(eventInstant(event.start, zone))) /
      60000,
  );
  if (minutes >= 60)
    return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return `${minutes}m`;
}
function eventDateLabel(event: CalendarEvent, zone: string) {
  const date = event.start.date ? `${event.start.date}T12:00:00Z` : event.start.dateTime!;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: event.start.date ? "UTC" : zone,
  }).format(new Date(date));
}
function reminderLabel(reminder: { minutes: number; method: string }) {
  const lead =
    reminder.minutes >= 60 && reminder.minutes % 60 === 0
      ? `${reminder.minutes / 60}h`
      : `${reminder.minutes}min`;
  return `${lead} before${reminder.method === "email" ? " · Email" : ""}`;
}
function EventWhen({
  event,
  zone,
  timeFormat,
}: {
  event: CalendarEvent;
  zone: string;
  timeFormat: "12" | "24";
}) {
  const timed = !event.start.date;
  return (
    <Section>
      <Row icon={<Clock />}>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium tabular-nums">
            {timed
              ? `${eventClock(event.start, zone, timeFormat)} → ${eventClock(event.end, zone, timeFormat)}`
              : "All day"}
          </span>
          {timed && (
            <span className="text-content-secondary">{eventDurationLabel(event, zone)}</span>
          )}
        </div>
        <p className="mt-0.5 text-content-secondary">{eventDateLabel(event, zone)}</p>
      </Row>
      <Row icon={<Globe2Icon />}>
        <span className="text-content-secondary">{zone.replaceAll("_", " ")}</span>
      </Row>
      {(event.recurringEventId || event.recurrence?.length) && (
        <Row icon={<RotateCwIcon />}>
          <span>Recurring event</span>
        </Row>
      )}
    </Section>
  );
}
function EventPeople({
  event,
  attendees,
  database,
  actions,
}: {
  event: CalendarEvent;
  attendees: CalendarAttendee[];
  database: CalendarDatabase | null;
  actions: Parameters<typeof EventActions>[0];
}) {
  const [expanded, setExpanded] = useState(false);
  const self = attendees.find((a) => a.self),
    others = attendees.filter((a) => !a.self);
  if (!attendees.length && !event.organizer) return null;
  return (
    <Section>
      <ParticipantCounts attendees={attendees} />
      <ExternalOrganizer event={event} attendees={attendees} />
      {(expanded ? others : others.slice(0, 3)).map((a) => (
        <Participant
          key={a.email}
          attendee={{ ...a, organizer: a.organizer || a.email === event.organizer?.email }}
        />
      ))}
      {others.length > 3 && (
        <Button
          variant="ghost"
          className="w-fit justify-start text-content-secondary"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer participants" : `See all ${attendees.length} participants`}
        </Button>
      )}
      {self && <Participant attendee={self} />}
      {database && <EventActions {...actions} section="rsvp" />}
    </Section>
  );
}
function ParticipantCounts({ attendees }: { attendees: CalendarAttendee[] }) {
  const yes = attendees.filter((a) => a.responseStatus === "accepted").length;
  const no = attendees.filter((a) => a.responseStatus === "declined").length;
  const maybe = attendees.filter((a) => a.responseStatus === "tentative").length;
  const awaiting = attendees.filter((a) => a.responseStatus === "needsAction").length;
  return (
    <Row icon={<UsersIcon />}>
      <h3 className="font-medium">{attendees.length} participants</h3>
      <p className="mt-0.5 text-content-secondary">
        {yes} yes · {no} no · {maybe} maybe · {awaiting} awaiting
      </p>
    </Row>
  );
}
function ExternalOrganizer({
  event,
  attendees,
}: {
  event: CalendarEvent;
  attendees: CalendarAttendee[];
}) {
  if (!event.organizer || attendees.some((a) => a.email === event.organizer?.email)) return null;
  return (
    <div>
      <p className="truncate">{event.organizer.email}</p>
      <p className="text-xs/relaxed text-content-secondary">Organiser</p>
    </div>
  );
}
function EventPlace({
  event,
  mapsProvider,
}: {
  event: CalendarEvent;
  mapsProvider?: "google" | "apple";
}) {
  if (!(event.conferenceUrl || event.location || event.description || event.conferenceStatus))
    return null;
  return (
    <Section>
      <EventConference event={event} />
      <EventLocation event={event} mapsProvider={mapsProvider} />
      {event.description && (
        <p className="whitespace-pre-wrap break-words text-content-secondary">
          {event.description}
        </p>
      )}
    </Section>
  );
}
function EventConference({ event }: { event: CalendarEvent }) {
  if (event.conferenceStatus === "pending")
    return <p role="status">Google Meet is being created.</p>;
  if (event.conferenceStatus === "failure")
    return (
      <p role="alert">
        The event was saved, but Google Meet could not be created. Open Google Calendar to retry.
      </p>
    );
  if (!event.conferenceUrl || !/^https:\/\//.test(event.conferenceUrl)) return null;
  return (
    <Row icon={<Video />}>
      <Button asChild variant="ghost" className="-ml-2 justify-start">
        <a href={event.conferenceUrl} target="_blank" rel="noopener noreferrer">
          {event.conferenceUrl.startsWith("https://meet.google.com/")
            ? "Google Meet"
            : "Join meeting"}
          <ArrowUpRightIcon />
        </a>
      </Button>
    </Row>
  );
}
function EventLocation({
  event,
  mapsProvider,
}: {
  event: CalendarEvent;
  mapsProvider?: "google" | "apple";
}) {
  if (!event.location) return null;
  return (
    <Row icon={<MapPin />}>
      <a
        className="break-words underline"
        href={calendarLocationUrl(event.location, mapsProvider)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {event.location}
      </a>
    </Row>
  );
}
function EventMeta({ event, calendar }: { event: CalendarEvent; calendar?: CalendarRecord }) {
  const reminders = event.reminders.useDefault
    ? (calendar?.defaultReminders ?? [])
    : (event.reminders.overrides ?? []);
  return (
    <Section>
      <Row icon={<CalendarIcon />}>
        <p className="truncate">{calendar?.name || event.calendarId}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-content-secondary">
          <span>{event.transparency === "transparent" ? "Free" : "Busy"}</span>
          <span>{eventVisibilityLabel(event.visibility)}</span>
        </div>
      </Row>
      <Row icon={<Bell />}>
        <p className="text-content-secondary">Reminders</p>
        <EventReminders reminders={reminders} />
      </Row>
    </Section>
  );
}
function eventVisibilityLabel(visibility: CalendarEvent["visibility"]) {
  if (visibility === "default") return "Default visibility";
  return `${visibility[0]!.toUpperCase()}${visibility.slice(1)}`;
}
function EventReminders({ reminders }: { reminders: { minutes: number; method: string }[] }) {
  if (!reminders.length) return <p className="mt-0.5">No reminders</p>;
  return (
    <>
      {reminders.map((reminder, index) => (
        <p key={index} className="mt-0.5">
          {reminderLabel(reminder)}
        </p>
      ))}
    </>
  );
}
export function CalendarEventDetails(props: Props) {
  const event = props.selected;
  const calendar = props.calendars.find((c) => c.id === event.calendarId);
  const attendees = [...event.attendees].sort(
    (a, b) =>
      Number(Boolean(b.organizer || b.email === event.organizer?.email)) -
      Number(Boolean(a.organizer || a.email === event.organizer?.email)),
  );
  const actions = {
    event,
    database: props.database!,
    calendars: props.calendars,
    online: props.online,
    onEdit: props.onEdit,
    onDuplicate: props.onDuplicate,
    onDone: props.onClose,
  };
  return (
    <div className="text-xs/relaxed text-content-primary">
      <Section>
        <h2 className="break-words font-heading text-sm font-medium">
          {event.title || "Untitled event"}
        </h2>
      </Section>
      <EventWhen event={event} zone={props.zone} timeFormat={props.timeFormat} />
      <EventPeople
        event={event}
        attendees={attendees}
        database={props.database}
        actions={actions}
      />
      <EventPlace event={event} mapsProvider={props.mapsProvider} />
      <EventMeta event={event} calendar={calendar} />
      <Section>
        {props.database && <EventActions {...actions} />}
        {/^https:\/\//.test(event.htmlLink) && (
          <Button asChild variant="outline">
            <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
              Open in Google Calendar
              <ArrowUpRightIcon />
            </a>
          </Button>
        )}
      </Section>
    </div>
  );
}
