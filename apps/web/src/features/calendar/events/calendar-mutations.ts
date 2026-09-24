import {
  calendarApiBasePath,
  calendarEventKey,
  eventOverlaps,
  type CalendarEvent,
  type CalendarEventWriteRequest,
  type CalendarMutationResponse,
} from "@zilobase/features/calendar";
import type { CalendarDatabase, PendingCalendarMutation } from "../storage/calendar-database";
import { apiFetch, ApiError } from "@/platform/network/api";
export type EventAction = "create" | "update" | "delete" | "duplicate" | "move" | "rsvp";
async function presentEvent(
  database: CalendarDatabase,
  event: CalendarEvent | undefined,
  removedKey?: string,
) {
  if (removedKey) await database.events.delete(removedKey);
  const key = event ? calendarEventKey(event) : undefined;
  if (event && key) await database.events.put({ key, event });
  for (const range of await database.ranges.toArray()) {
    const eventKeys = range.eventKeys.filter((k) => k !== removedKey && k !== key);
    if (event && key && belongsToRange(event, range)) eventKeys.push(key);
    await database.ranges.put({ ...range, eventKeys });
  }
}
async function settle(
  database: CalendarDatabase,
  pending: PendingCalendarMutation,
  result: CalendarMutationResponse,
) {
  await database.transaction("rw", database.pending, database.events, database.ranges, async () => {
    if (result.status === "succeeded") {
      await presentEvent(database, result.event, pending.eventKey);
      await database.pending.delete(pending.id);
    } else if (result.status === "failed") {
      await presentEvent(database, pending.before, pending.eventKey);
      await database.pending.delete(pending.id);
    } else await database.pending.update(pending.id, { status: "ambiguous" });
  });
}
export async function runCalendarMutation(
  input: {
    database: CalendarDatabase;
    action: EventAction;
    event: CalendarEvent;
    write: CalendarEventWriteRequest;
    destination?: string;
    responseStatus?: "accepted" | "declined" | "tentative";
  },
  transport: typeof apiFetch = apiFetch,
) {
  const { database, event, action, write } = input,
    key = calendarEventKey(event);
  const pending: PendingCalendarMutation = {
    id: write.operationId,
    eventKey: key,
    before:
      action === "create" || action === "duplicate"
        ? undefined
        : ((await database.events.get(key))?.event ?? event),
    optimistic: action === "delete" ? undefined : { ...event, ...write.event },
    status: "pending",
  };
  await database.transaction("rw", database.pending, database.events, database.ranges, async () => {
    if (await database.pending.where("eventKey").equals(key).count())
      throw new Error(
        "This event has an unresolved change. Check its status before editing again.",
      );
    await database.pending.add(pending);
    await presentEvent(database, action === "delete" ? undefined : pending.optimistic, key);
  });
  try {
    const path = `${calendarApiBasePath(database.identity.workspaceId)}/connections/${encodeURIComponent(database.identity.bindingId)}/calendars/${encodeURIComponent(event.calendarId)}/events${action === "create" ? "" : `/${encodeURIComponent(event.eventId)}/${action}`}`;
    const result = await transport<CalendarMutationResponse>(path, {
      method: "POST",
      body: JSON.stringify({
        ...write,
        destination: input.destination,
        responseStatus: input.responseStatus,
      }),
    });
    await settle(database, pending, result);
    return result;
  } catch (error) {
    const definite = definiteRejection(error);
    await settle(database, pending, {
      operationId: write.operationId,
      status: definite ? "failed" : "ambiguous",
    });
    throw error;
  }
}
export async function reconcileCalendarMutations(
  database: CalendarDatabase,
  transport: typeof apiFetch = apiFetch,
) {
  for (const pending of await database.pending.toArray()) {
    try {
      const result = await transport<CalendarMutationResponse>(
        `${calendarApiBasePath(database.identity.workspaceId)}/operations/${encodeURIComponent(pending.id)}`,
      );
      if (database.isOpen()) await settle(database, pending, result);
    } catch {
      return;
    }
  }
}

function definiteRejection(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![408, 429].includes(error.status)
  );
}
function belongsToRange(
  event: CalendarEvent,
  range: { calendarId: string; start: string; end: string },
) {
  return (
    range.calendarId === event.calendarId &&
    eventOverlaps(event, range.start, range.end, event.start.timeZone ?? "UTC")
  );
}
