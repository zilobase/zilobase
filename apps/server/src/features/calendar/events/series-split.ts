import { and, eq, inArray, sql } from "drizzle-orm";
import {
  dayInstant,
  type CalendarEventTime,
  type CalendarMutationResponse,
} from "@zilobase/features/calendar";
import { db } from "../../../infrastructure/database";
import { calendarBinding, calendarMutationReceipt } from "../../../infrastructure/database/schema";
import { sha256Hex } from "../../../shared/crypto/sha256";
import {
  CalendarGateway,
  CalendarProviderError,
  googleEventSchema,
  normalizeEvent,
  type GoogleCalendarEvent,
} from "../provider/gateway";
import { splitRecurrence } from "./recurrence";
import {
  markOperation,
  operationMarker,
  writableCalendar,
  requireEventCapability,
} from "./provider-writes";
import { providerEventPatch, validateEventInterval, type CalendarWrite } from "./input";
import type { CalendarMutationInput } from "./mutations";
type SplitSteps = {
  action: "split";
  headId: string;
  headEtag: string;
  headBody: Record<string, unknown>;
  tailBody: Record<string, unknown> | null;
  headDone: boolean;
  zone: string;
  sendUpdates: string;
  headOnly: boolean;
  deleteHead: boolean;
};
async function loadSeries(input: CalendarMutationInput, gateway: CalendarGateway, path: string) {
  if (!["update", "delete"].includes(input.action))
    throw new CalendarProviderError(400, "invalid_series_action");
  const occurrence = googleEventSchema.parse(
    await gateway.request(`${path}/${encodeURIComponent(input.eventId!)}`),
  );
  if (
    !occurrence.recurringEventId ||
    !occurrence.originalStartTime ||
    occurrence.etag !== input.write.etag
  )
    throw new CalendarProviderError(412, "series_occurrence_changed");
  const head = googleEventSchema.parse(
    await gateway.request(`${path}/${encodeURIComponent(occurrence.recurringEventId)}`),
  );
  validateSeries(head);
  return { head, occurrence };
}
function validateSeries(head: GoogleCalendarEvent) {
  if (!head.start || !head.recurrence) throw new CalendarProviderError(409, "series_unavailable");
}
function precedes(item: unknown, original: CalendarEventTime) {
  const event = googleEventSchema.parse(item),
    value = event.originalStartTime ?? event.start;
  if (!value) return false;
  return value.date && original.date
    ? value.date < original.date
    : Date.parse(value.dateTime!) < Date.parse(original.dateTime!);
}
async function countPreceding(
  head: GoogleCalendarEvent,
  original: CalendarEventTime,
  gateway: CalendarGateway,
  path: string,
  zone: string,
) {
  if (!head.recurrence!.some((rule) => /(?:^|;)COUNT=/.test(rule))) return 0;
  let count = 0,
    pageToken: string | undefined;
  for (let page = 0; ; page++) {
    if (page >= 100) throw new CalendarProviderError(400, "series_too_large_to_split");
    const params = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "true",
      timeMax: original.dateTime ?? dayInstant(original.date!, zone),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await gateway.request<{ items?: unknown[]; nextPageToken?: string }>(
      `${path}/${encodeURIComponent(head.id)}/instances?${params}`,
    );
    count += (result.items ?? []).filter((item) => precedes(item, original)).length;
    pageToken = result.nextPageToken;
    if (!pageToken) return count;
  }
}
async function splitSteps(
  input: CalendarMutationInput,
  head: GoogleCalendarEvent,
  occurrence: GoogleCalendarEvent,
  rules: { head: string[]; tail: string[] },
  zone: string,
  first: boolean,
): Promise<SplitSteps> {
  const tailId = `cs${await sha256Hex(`${input.bindingId}:${input.write.operationId}`)}`;
  const headBody = first
    ? { ...head, ...providerEventPatch(input.write) }
    : { ...head, recurrence: rules.head };
  const tailBody =
    first || input.action === "delete"
      ? null
      : successorBody(input, head, occurrence, rules.tail, tailId);
  applySeriesConference(input.write, first ? headBody : tailBody);
  if (tailBody) validateEventInterval(tailBody as CalendarWrite["event"]);
  return {
    action: "split",
    headId: head.id,
    headEtag: head.etag!,
    headBody: markOperation(headBody, input.write.operationId),
    tailBody,
    headDone: false,
    zone,
    sendUpdates: input.write.sendUpdates,
    headOnly: first,
    deleteHead: first && input.action === "delete",
  };
}
function successorBody(
  input: CalendarMutationInput,
  head: GoogleCalendarEvent,
  occurrence: GoogleCalendarEvent,
  recurrence: string[],
  id: string,
) {
  const {
    etag: _etag,
    id: _id,
    recurringEventId: _series,
    originalStartTime: _original,
    iCalUID: _uid,
    ...tailSource
  } = head;
  return markOperation(
    {
      ...tailSource,
      ...providerEventPatch(input.write),
      id,
      start: input.write.event.start ?? occurrence.start,
      end: input.write.event.end ?? occurrence.end,
      recurrence: input.write.event.recurrence ?? recurrence,
    },
    input.write.operationId,
  );
}
function applySeriesConference(write: CalendarWrite, target: Record<string, unknown> | null) {
  if (write.createMeet && target)
    target.conferenceData = {
      createRequest: {
        requestId: write.operationId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
}
async function reserveSplit(
  accountId: string,
  input: CalendarMutationInput,
  steps: SplitSteps,
  hash: string,
) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`calendar-write:${accountId}:${input.calendarId}:${steps.headId}`}))`,
    );
    const [existing] = await tx
      .select()
      .from(calendarMutationReceipt)
      .where(eq(calendarMutationReceipt.id, input.write.operationId));
    if (existing) {
      if (existing.requestHash !== hash || existing.bindingId !== input.bindingId)
        throw new CalendarProviderError(409, "operation_identity_conflict");
      return;
    }
    const [pending] = await tx
      .select()
      .from(calendarMutationReceipt)
      .innerJoin(calendarBinding, eq(calendarBinding.id, calendarMutationReceipt.bindingId))
      .where(
        and(
          eq(calendarBinding.accountId, accountId),
          eq(calendarMutationReceipt.calendarId, input.calendarId),
          eq(calendarMutationReceipt.eventId, steps.headId),
          inArray(calendarMutationReceipt.status, ["pending", "ambiguous"]),
        ),
      );
    if (pending) throw new CalendarProviderError(409, "event_operation_pending");
    await tx.insert(calendarMutationReceipt).values({
      id: input.write.operationId,
      bindingId: input.bindingId,
      requestHash: hash,
      calendarId: input.calendarId,
      eventId: steps.headId,
      steps,
    });
  });
}
export async function prepareSeriesSplit(
  input: CalendarMutationInput,
  accountId: string,
  gateway: CalendarGateway,
  hash: string,
) {
  const calendar = await writableCalendar(accountId, input.calendarId),
    path = `/calendars/${encodeURIComponent(input.calendarId)}/events`;
  const { head, occurrence } = await loadSeries(input, gateway, path);
  requireEventCapability("following", calendar.data.permissions, head);
  const original = occurrence.originalStartTime as CalendarEventTime;
  const first = original.date
    ? original.date === head.start!.date
    : Date.parse(original.dateTime!) === Date.parse(head.start!.dateTime!);
  const preceding = await countPreceding(head, original, gateway, path, calendar.data.timeZone);
  const rules = first
    ? { head: head.recurrence!, tail: head.recurrence! }
    : splitRecurrence(head.recurrence!, original, preceding);
  const steps = await splitSteps(input, head, occurrence, rules, calendar.data.timeZone, first);
  await reserveSplit(accountId, input, steps, hash);
}
async function readOptionalEvent(gateway: CalendarGateway, path: string) {
  try {
    return googleEventSchema.parse(await gateway.request(path));
  } catch (error) {
    if (error instanceof CalendarProviderError && error.status === 404) return null;
    throw error;
  }
}
async function resumeHead(
  steps: SplitSteps,
  id: string,
  gateway: CalendarGateway,
  path: string,
  query: URLSearchParams,
) {
  const url = `${path}/${encodeURIComponent(steps.headId)}`,
    head = await readOptionalEvent(gateway, url);
  if (!head && steps.deleteHead) return null;
  if (!head) throw new CalendarProviderError(409, "series_unavailable");
  if (operationMarker(head) === id) return head;
  if (steps.headDone || head.etag !== steps.headEtag)
    throw new CalendarProviderError(412, "series_changed_during_split");
  return gateway.request(`${url}?${query}`, {
    method: steps.deleteHead ? "DELETE" : "PUT",
    headers: { "If-Match": steps.headEtag },
    body: steps.deleteHead ? undefined : JSON.stringify(steps.headBody),
  });
}
async function resumeTail(
  steps: SplitSteps,
  id: string,
  gateway: CalendarGateway,
  path: string,
  query: URLSearchParams,
) {
  if (!steps.tailBody) return null;
  const url = `${path}/${encodeURIComponent(String(steps.tailBody.id))}`;
  let tail: unknown = await readOptionalEvent(gateway, url);
  if (!tail) {
    try {
      tail = await gateway.request(`${path}?${query}`, {
        method: "POST",
        body: JSON.stringify(steps.tailBody),
      });
    } catch (error) {
      if (!(error instanceof CalendarProviderError && error.status === 409)) throw error;
      tail = await gateway.request(url);
    }
  }
  if (operationMarker(googleEventSchema.parse(tail)) !== id)
    throw new CalendarProviderError(409, "series_successor_identity_conflict");
  return tail;
}
/** Resume by verifying markers before ETag-fenced updates and deterministic-ID inserts. */
export async function resumeSeriesSplit(
  receipt: typeof calendarMutationReceipt.$inferSelect,
  workspaceId: string,
  gateway: CalendarGateway,
): Promise<CalendarMutationResponse> {
  const steps = receipt.steps as SplitSteps,
    path = `/calendars/${encodeURIComponent(receipt.calendarId)}/events`;
  const query = new URLSearchParams({ sendUpdates: steps.sendUpdates, conferenceDataVersion: "1" });
  try {
    const head = await resumeHead(steps, receipt.id, gateway, path, query);
    await db
      .update(calendarMutationReceipt)
      .set({ steps: { ...steps, headDone: true }, updatedAt: new Date() })
      .where(eq(calendarMutationReceipt.id, receipt.id));
    const tail = steps.headOnly ? head : await resumeTail(steps, receipt.id, gateway, path, query);
    return {
      operationId: receipt.id,
      status: "succeeded",
      ...(tail
        ? {
            event: normalizeEvent(
              tail,
              { workspaceId, bindingId: receipt.bindingId, calendarId: receipt.calendarId },
              steps.zone,
            ),
          }
        : {}),
    };
  } catch (error) {
    const result: CalendarMutationResponse = {
      operationId: receipt.id,
      status: "ambiguous",
      error: error instanceof CalendarProviderError ? error.code : "series_split_pending",
    };
    await db
      .update(calendarMutationReceipt)
      .set({ status: "ambiguous", result, updatedAt: new Date() })
      .where(eq(calendarMutationReceipt.id, receipt.id));
    return result;
  }
}
