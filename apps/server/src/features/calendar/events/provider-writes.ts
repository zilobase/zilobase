import {
  calendarCapability,
  type CalendarPermissions,
  type CalendarOperation,
} from "@zilobase/features/calendar";
import type { CalendarWrite } from "./input";
import { providerEventPatch, validateEventInterval } from "./input";
import type { CalendarMutationInput } from "./mutations";
import {
  CalendarGateway,
  CalendarProviderError,
  googleEventSchema,
  type GoogleCalendarEvent,
} from "../provider/gateway";
import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { calendarProviderCalendar } from "../../../infrastructure/database/schema";
export function markOperation(body: Record<string, unknown>, id: string) {
  const extended = body.extendedProperties as { private?: Record<string, string> } | undefined;
  return {
    ...body,
    extendedProperties: { ...extended, private: { ...extended?.private, zilobaseOperationId: id } },
  };
}
export function operationMarker(raw: GoogleCalendarEvent) {
  return (raw.extendedProperties as { private?: { zilobaseOperationId?: string } } | undefined)
    ?.private?.zilobaseOperationId;
}
export async function writableCalendar(accountId: string, calendarId: string, rsvp = false) {
  const [calendar] = await db
    .select()
    .from(calendarProviderCalendar)
    .where(
      and(
        eq(calendarProviderCalendar.accountId, accountId),
        eq(calendarProviderCalendar.calendarId, calendarId),
      ),
    );
  if (
    !calendar ||
    !calendar.data.permissions.read ||
    calendar.data.permissions.freeBusyOnly ||
    (!calendar.data.permissions.write && !rsvp)
  )
    throw new CalendarProviderError(403, "calendar_read_only");
  return calendar;
}
function checkEvent(raw: GoogleCalendarEvent, write: CalendarWrite) {
  if (!write.etag || raw.etag !== write.etag) throw new CalendarProviderError(412, "event_changed");
}
function rsvpBody(raw: GoogleCalendarEvent, status: CalendarMutationInput["responseStatus"]) {
  if (!raw.attendees?.some((a) => a.self) || !status)
    throw new CalendarProviderError(403, "not_an_attendee");
  return {
    ...raw,
    attendees: raw.attendees.map((a) => (a.self ? { ...a, responseStatus: status } : a)),
  };
}
function createBody(
  raw: GoogleCalendarEvent | null,
  input: CalendarMutationInput,
  eventId: string,
) {
  let body: Record<string, unknown> = { ...raw, ...providerEventPatch(input.write) };
  if (input.action === "rsvp") body = rsvpBody(raw!, input.responseStatus);
  const normalized = googleEventSchema.parse({ ...body, id: eventId });
  try {
    validateEventInterval(normalized as CalendarWrite["event"]);
  } catch {
    throw new CalendarProviderError(400, "invalid_event_interval");
  }
  body = markOperation(body, input.write.operationId);
  if (input.write.createMeet)
    body.conferenceData = {
      createRequest: {
        requestId: input.write.operationId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  return body;
}
async function moveEvent(
  gateway: CalendarGateway,
  accountId: string,
  input: CalendarMutationInput,
  raw: GoogleCalendarEvent,
  path: string,
  query: URLSearchParams,
) {
  if (!input.destination) throw new CalendarProviderError(400, "destination_required");
  await writableCalendar(accountId, input.destination);
  const marked = googleEventSchema.parse(
    await gateway.request(`${path}/${encodeURIComponent(raw.id)}?sendUpdates=none`, {
      method: "PATCH",
      headers: { "If-Match": raw.etag! },
      body: JSON.stringify({
        extendedProperties: markOperation(raw, input.write.operationId).extendedProperties,
      }),
    }),
  );
  query.set("destination", input.destination);
  return gateway.request(`${path}/${encodeURIComponent(raw.id)}/move?${query}`, {
    method: "POST",
    headers: { "If-Match": marked.etag! },
  });
}
export function requireEventCapability(
  operation: CalendarOperation,
  permissions: CalendarPermissions,
  event?: GoogleCalendarEvent,
) {
  const capability = calendarCapability(operation, permissions, event);
  if (!capability.allowed) throw new CalendarProviderError(403, capability.code);
}
export async function executeProviderWrite(
  gateway: CalendarGateway,
  accountId: string,
  input: CalendarMutationInput,
  eventId: string,
) {
  const creating = ["create", "duplicate"].includes(input.action),
    path = `/calendars/${encodeURIComponent(input.calendarId)}/events`;
  let raw: GoogleCalendarEvent | null = null;
  if (input.action !== "create") {
    raw = googleEventSchema.parse(
      await gateway.request(`${path}/${encodeURIComponent(input.eventId!)}`),
    );
    checkEvent(raw, input.write);
  }
  const calendar = await writableCalendar(accountId, input.calendarId, input.action === "rsvp");
  requireEventCapability(input.action, calendar.data.permissions, raw ?? undefined);
  const query = new URLSearchParams({
    sendUpdates: input.write.sendUpdates,
    conferenceDataVersion: "1",
  });
  if (input.action === "delete")
    return gateway.request(`${path}/${encodeURIComponent(eventId)}?${query}`, {
      method: "DELETE",
      headers: { "If-Match": input.write.etag! },
    });
  if (input.action === "move") return moveEvent(gateway, accountId, input, raw!, path, query);
  return writeEventBody(
    gateway,
    path,
    query,
    eventId,
    creating,
    createBody(raw, input, eventId),
    input.write.etag,
  );
}
function writeEventBody(
  gateway: CalendarGateway,
  path: string,
  query: URLSearchParams,
  eventId: string,
  creating: boolean,
  body: ReturnType<typeof createBody>,
  etag?: string,
) {
  if (creating) {
    for (const key of [
      "etag",
      "recurringEventId",
      "originalStartTime",
      "iCalUID",
      "created",
      "updated",
      "organizer",
      "creator",
    ] as const)
      delete body[key];
    body.id = eventId;
  }
  return gateway.request(`${path}${creating ? "" : `/${encodeURIComponent(eventId)}`}?${query}`, {
    method: creating ? "POST" : "PUT",
    body: JSON.stringify(body),
    ...(creating ? {} : { headers: { "If-Match": etag! } }),
  });
}
