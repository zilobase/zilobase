import type { CalendarPermissions } from "./contracts";

export type CalendarOperation =
  | "create"
  | "update"
  | "delete"
  | "duplicate"
  | "rsvp"
  | "move"
  | "following";
type CapabilityEvent = {
  eventType?: string;
  status?: string;
  recurringEventId?: string;
  organizer?: { self?: boolean };
  attendees?: { self?: boolean }[];
};
export type CalendarCapability =
  | { allowed: true }
  | { allowed: false; code: string; reason: string };

/** Local support and known Google permissions; Google remains authoritative at delivery. */
export function calendarCapability(
  operation: CalendarOperation,
  permissions?: CalendarPermissions,
  event?: CapabilityEvent,
): CalendarCapability {
  const access = calendarAccessCapability(operation, permissions);
  if (!access.allowed) return access;
  if (operation === "create") return { allowed: true };
  return calendarEventCapability(operation, event);
}

function calendarAccessCapability(
  operation: CalendarOperation,
  permissions?: CalendarPermissions,
): CalendarCapability {
  if (!permissions?.read || permissions.freeBusyOnly)
    return denied("calendar_unavailable", "This calendar does not grant access to event details.");
  if (operation !== "rsvp" && !permissions.write)
    return denied("calendar_read_only", "This calendar is read-only.");
  return { allowed: true };
}

function calendarEventCapability(
  operation: CalendarOperation,
  event?: CapabilityEvent,
): CalendarCapability {
  if (!event) return denied("event_required", "Select an event first.");
  const blocked = calendarEventBlock(event);
  if (blocked) return blocked;
  return calendarEventOperation(operation, event);
}

function calendarEventBlock(event: CapabilityEvent): CalendarCapability | null {
  if (event.status === "cancelled")
    return denied("event_cancelled", "This event has been cancelled.");
  if (event.eventType && event.eventType !== "default")
    return denied(
      "specialized_event_read_only",
      "Editing this Google event type is not supported yet. Open it in Google Calendar.",
    );
  return null;
}

function calendarEventOperation(
  operation: CalendarOperation,
  event: CapabilityEvent,
): CalendarCapability {
  if (operation === "rsvp") return calendarRsvpCapability(event);
  if (operation === "move") return calendarMoveCapability(event);
  if (operation === "following") return calendarFollowingCapability(event);
  return { allowed: true };
}
function calendarRsvpCapability(event: CapabilityEvent): CalendarCapability {
  return event.attendees?.some((attendee) => attendee.self)
    ? { allowed: true }
    : denied("not_an_attendee", "Only an invited participant can respond to this event.");
}
function calendarMoveCapability(event: CapabilityEvent): CalendarCapability {
  return event.organizer?.self === true && !event.recurringEventId
    ? { allowed: true }
    : denied(
        "event_move_not_allowed",
        "Only the organizer can move a non-recurring event between calendars.",
      );
}
function calendarFollowingCapability(event: CapabilityEvent): CalendarCapability {
  return event.organizer?.self === true
    ? { allowed: true }
    : denied("series_edit_not_allowed", "Only the organizer can change this and following events.");
}

function denied(code: string, reason: string): CalendarCapability {
  return { allowed: false, code, reason };
}
