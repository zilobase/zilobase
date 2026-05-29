import { useState, type CSSProperties, type ReactNode } from "react";

import type {
  GoogleCalendarCalendarListEntry,
  GoogleCalendarEventSummary,
  GoogleCalendarFreeBusyResponse,
} from "./types.js";

const calendarIconSrc = "/icons/google-calendar.svg";
const separatorBorder =
  "1px solid color-mix(in srgb, currentColor 10%, transparent)";

const styles: Record<string, CSSProperties> = {
  panel: {
    display: "grid",
    gap: 10,
  },
  searchHeader: {
    alignItems: "center",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sourceTitle: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    minWidth: 0,
  },
  sourceIcon: {
    flex: "0 0 auto",
    height: 16,
    width: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.3,
    marginTop: 3,
  },
  searchSummary: {
    color: "color-mix(in srgb, currentColor 60%, transparent)",
    fontSize: 11,
    lineHeight: 1.35,
    marginTop: 2,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flex: "0 0 auto",
    gap: 6,
  },
  pill: {
    border: "1px solid color-mix(in srgb, currentColor 15%, transparent)",
    borderRadius: 999,
    color: "color-mix(in srgb, currentColor 68%, transparent)",
    fontSize: 11,
    lineHeight: 1,
    padding: "4px 7px",
    whiteSpace: "nowrap",
  },
  toggleButton: {
    alignItems: "center",
    background: "transparent",
    border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
    borderRadius: 999,
    color: "color-mix(in srgb, currentColor 70%, transparent)",
    cursor: "pointer",
    display: "inline-flex",
    font: "inherit",
    fontSize: 12,
    height: 24,
    justifyContent: "center",
    lineHeight: 1,
    padding: 0,
    width: 24,
  },
  collapseRegion: {
    display: "grid",
    overflow: "hidden",
    transition:
      "grid-template-rows 180ms ease, opacity 160ms ease, margin-top 180ms ease",
  },
  collapseInner: {
    minHeight: 0,
    overflow: "hidden",
  },
  rowList: {
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 8,
    display: "grid",
    overflow: "hidden",
  },
  row: {
    borderTop: separatorBorder,
    display: "grid",
    gap: 6,
    padding: "10px 12px",
  },
  meta: {
    color: "color-mix(in srgb, currentColor 66%, transparent)",
    display: "flex",
    flexWrap: "wrap",
    fontSize: 12,
    gap: "6px 10px",
    lineHeight: 1.35,
  },
  snippet: {
    color: "color-mix(in srgb, currentColor 78%, transparent)",
    fontSize: 13,
    lineHeight: 1.45,
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  empty: {
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 8,
    color: "color-mix(in srgb, currentColor 66%, transparent)",
    fontSize: 13,
    padding: 12,
  },
};

export type GoogleCalendarToolName =
  | "listGoogleCalendarCalendars"
  | "listGoogleCalendarEvents"
  | "queryGoogleCalendarFreeBusy";

export type ListGoogleCalendarCalendarsOutput = {
  calendars?: GoogleCalendarCalendarListEntry[];
  nextPageToken?: string;
};

export type ListGoogleCalendarEventsOutput = {
  calendarId: string;
  events?: GoogleCalendarEventSummary[];
  nextPageToken?: string;
  timeZone?: string;
};

export type GoogleCalendarToolOutput =
  | GoogleCalendarFreeBusyResponse
  | ListGoogleCalendarCalendarsOutput
  | ListGoogleCalendarEventsOutput;

export type GoogleCalendarToolOutputProps = {
  className?: string;
  output: GoogleCalendarToolOutput;
  toolName: GoogleCalendarToolName;
};

export function GoogleCalendarToolOutput({
  className,
  output,
  toolName,
}: GoogleCalendarToolOutputProps) {
  if (toolName === "listGoogleCalendarCalendars") {
    return (
      <CalendarPanel
        className={className}
        countLabel={`${(output as ListGoogleCalendarCalendarsOutput).calendars?.length ?? 0} calendars`}
        summary={
          (output as ListGoogleCalendarCalendarsOutput).calendars?.length
            ? `${(output as ListGoogleCalendarCalendarsOutput).calendars!.length} calendars shown from Google Calendar`
            : "No calendars returned from Google Calendar"
        }
        title="Calendars"
      >
        {(output as ListGoogleCalendarCalendarsOutput).calendars?.length ? (
          <div style={styles.rowList}>
            {(output as ListGoogleCalendarCalendarsOutput).calendars!.map(
              (calendar, index) => (
                <CalendarRow key={calendar.id} isFirst={index === 0}>
                  <strong>{calendar.summary || calendar.id}</strong>
                  <div style={styles.meta}>
                    {calendar.primary ? "Primary" : calendar.accessRole}
                    {calendar.timeZone ? `Time zone: ${calendar.timeZone}` : null}
                  </div>
                </CalendarRow>
              ),
            )}
          </div>
        ) : (
          <Empty>No calendars returned.</Empty>
        )}
      </CalendarPanel>
    );
  }

  if (toolName === "queryGoogleCalendarFreeBusy") {
    const calendars =
      (output as GoogleCalendarFreeBusyResponse).calendars ?? {};

    return (
      <CalendarPanel
        className={className}
        countLabel={`${Object.entries(calendars).length} calendars`}
        summary={
          Object.entries(calendars).length
            ? `${Object.entries(calendars).length} availability results from Google Calendar`
            : "No availability returned from Google Calendar"
        }
        title="Availability"
      >
        {Object.entries(calendars).length ? (
          <div style={styles.rowList}>
            {Object.entries(calendars).map(([calendarId, result], index) => (
              <CalendarRow key={calendarId} isFirst={index === 0}>
                <strong>{calendarId}</strong>
                <div style={styles.meta}>
                  {result.busy?.length ?? 0} busy blocks
                </div>
              </CalendarRow>
            ))}
          </div>
        ) : (
          <Empty>No availability returned.</Empty>
        )}
      </CalendarPanel>
    );
  }

  const eventOutput = output as ListGoogleCalendarEventsOutput;

  return (
    <CalendarPanel
      className={className}
      countLabel={`${eventOutput.events?.length ?? 0} shown`}
      summary={
        eventOutput.events?.length
          ? `${eventOutput.events.length} events shown from Google Calendar`
          : "No events returned from Google Calendar"
      }
      title="Calendar events"
    >
      {eventOutput.events?.length ? (
        <div style={styles.rowList}>
          {eventOutput.events.map((event, index) => (
            <CalendarRow
              isFirst={index === 0}
              key={`${event.calendarId}:${event.id}`}
            >
              <strong>{event.summary || "(No title)"}</strong>
              <div style={styles.meta}>
                {formatEventRange(event.start, event.end)}
                {event.location ? `Location: ${event.location}` : null}
              </div>
            </CalendarRow>
          ))}
        </div>
      ) : (
        <Empty>No events returned.</Empty>
      )}
      {eventOutput.nextPageToken ? (
        <div style={{ ...styles.meta, paddingTop: 2 }}>
          More results are available in Google Calendar.
        </div>
      ) : null}
    </CalendarPanel>
  );
}

export function isGoogleCalendarToolName(
  toolName: string,
): toolName is GoogleCalendarToolName {
  return (
    toolName === "listGoogleCalendarCalendars" ||
    toolName === "listGoogleCalendarEvents" ||
    toolName === "queryGoogleCalendarFreeBusy"
  );
}

function CalendarPanel({
  children,
  className,
  countLabel,
  summary,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  countLabel: string;
  summary: string;
  title: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className={className} style={styles.panel}>
      <div style={styles.searchHeader}>
        <div>
          <SourceTitle iconSrc={calendarIconSrc} title={title} />
          <div style={styles.searchSummary}>{summary}</div>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.pill}>{countLabel}</span>
          <button
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? "Hide Google Calendar results"
                : "Show Google Calendar results"
            }
            onClick={() => setIsExpanded((current) => !current)}
            style={styles.toggleButton}
            type="button"
          >
            <ChevronIcon expanded={isExpanded} />
          </button>
        </div>
      </div>
      <div
        style={{
          ...styles.collapseRegion,
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          marginTop: isExpanded ? 0 : -6,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div style={styles.collapseInner}>{children}</div>
      </div>
    </section>
  );
}

function CalendarRow({
  children,
  isFirst,
}: {
  children: React.ReactNode;
  isFirst: boolean;
}) {
  return (
    <article style={{ ...styles.row, borderTop: isFirst ? 0 : separatorBorder }}>
      {children}
    </article>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={styles.empty}>{children}</div>;
}

function SourceTitle({ iconSrc, title }: { iconSrc: string; title: ReactNode }) {
  return (
    <div style={styles.sourceTitle}>
      <img alt="" aria-hidden="true" src={iconSrc} style={styles.sourceIcon} />
      <div style={{ ...styles.title, marginTop: 0 }}>{title}</div>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      style={{
        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 140ms ease",
      }}
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function formatEventRange(
  start?: { date?: string; dateTime?: string },
  end?: { date?: string; dateTime?: string },
) {
  if (!start?.date && !start?.dateTime) {
    return "Unknown time";
  }

  if (start.date) {
    const startDate = parseDateOnly(start.date);
    const endDate = end?.date ? parseDateOnly(end.date) : undefined;

    if (!startDate) {
      return start.date;
    }

    const adjustedEndDate = endDate
      ? new Date(endDate.getTime() - 24 * 60 * 60 * 1000)
      : undefined;

    if (
      adjustedEndDate &&
      adjustedEndDate.getTime() !== startDate.getTime()
    ) {
      return `${formatDate(startDate)} - ${formatDate(adjustedEndDate)}`;
    }

    return formatDate(startDate);
  }

  const startDateTime = start.dateTime ? new Date(start.dateTime) : undefined;
  const endDateTime = end?.dateTime ? new Date(end.dateTime) : undefined;

  if (!startDateTime || Number.isNaN(startDateTime.getTime())) {
    return start.dateTime || "Unknown time";
  }

  if (!endDateTime || Number.isNaN(endDateTime.getTime())) {
    return `${formatDate(startDateTime)}, ${formatTime(startDateTime)}`;
  }

  if (isSameLocalDate(startDateTime, endDateTime)) {
    return `${formatDate(startDateTime)}, ${formatTime(startDateTime)} - ${formatTime(endDateTime)}`;
  }

  return `${formatDate(startDateTime)}, ${formatTime(startDateTime)} - ${formatDate(endDateTime)}, ${formatTime(endDateTime)}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    weekday: "short",
    year: "numeric",
  }).format(value);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function isSameLocalDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
