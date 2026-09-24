import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { calendarMutationReceipt } from "../../../infrastructure/database/schema";
import type { CalendarEventTime, CalendarMutationResponse } from "@zilobase/features/calendar";
import type { RuntimeEnv } from "../../../shared/config/config";
import { sha256Hex } from "../../../shared/crypto/sha256";
import { requireCalendarBinding } from "../connections/ownership";
import {
  CalendarGateway,
  CalendarProviderError,
  googleEventSchema,
  normalizeEvent,
} from "../provider/gateway";
import { createCalendarGateway } from "../provider/oauth";
import { shiftSeriesTime } from "./recurrence";
import { prepareSeriesSplit, resumeSeriesSplit } from "./series-split";
import { executeProviderWrite, writableCalendar, operationMarker } from "./provider-writes";
import {
  completeCalendarMutation,
  existingCalendarMutation,
  reserveCalendarMutation,
  failCalendarMutation,
} from "./mutation-receipts";
import type { CalendarWrite, CalendarMutationAction } from "./input";
export type CalendarMutationInput = {
  userId: string;
  workspaceId: string;
  bindingId: string;
  calendarId: string;
  eventId?: string;
  action: CalendarMutationAction;
  write: CalendarWrite;
  destination?: string;
  responseStatus?: "accepted" | "declined" | "tentative";
};
export async function mutateCalendarEvent(
  env: RuntimeEnv,
  input: CalendarMutationInput,
  supplied?: CalendarGateway,
): Promise<CalendarMutationResponse> {
  const { account, binding } = await requireCalendarBinding(
    input.userId,
    input.workspaceId,
    input.bindingId,
  );
  const hash = await sha256Hex(JSON.stringify(input));
  const prior = await existingCalendarMutation(input, hash);
  if (prior) return prior;
  const gateway = supplied ?? (await createCalendarGateway(env, account));
  if (input.write.recurrenceScope === "following")
    return splitSeries(input, account.id, gateway, hash);
  input = await resolveSeriesScope(input, gateway);
  const operationId = input.write.operationId;
  const eventId = await providerEventId(input);
  if (!eventId) throw new CalendarProviderError(400, "event_required");
  const existing = await reserveCalendarMutation(account.id, input, hash, eventId);
  if (existing) return existing;
  try {
    const calendar = await writableCalendar(account.id, input.calendarId, input.action === "rsvp");
    const response = await executeProviderWrite(gateway, account.id, input, eventId);
    const result: CalendarMutationResponse = {
      operationId,
      status: "succeeded",
      ...(response
        ? {
            event: normalizeEvent(
              response,
              {
                workspaceId: binding.workspaceId,
                bindingId: binding.id,
                calendarId: input.destination ?? input.calendarId,
              },
              calendar.data.timeZone,
            ),
          }
        : {}),
    };
    await completeCalendarMutation(account.id, input.calendarId, result, input.destination);
    return result;
  } catch (error) {
    return failCalendarMutation(operationId, error);
  }
}
async function splitSeries(
  input: CalendarMutationInput,
  accountId: string,
  gateway: CalendarGateway,
  hash: string,
) {
  await prepareSeriesSplit(input, accountId, gateway, hash);
  const [receipt] = await db
    .select()
    .from(calendarMutationReceipt)
    .where(eq(calendarMutationReceipt.id, input.write.operationId));
  const result = await resumeSeriesSplit(receipt!, input.workspaceId, gateway);
  if (result.status === "succeeded")
    await completeCalendarMutation(accountId, input.calendarId, result);
  return result;
}
async function resolveSeriesScope(input: CalendarMutationInput, gateway: CalendarGateway) {
  if (input.write.recurrenceScope !== "series" || !input.eventId) return input;
  const path = `/calendars/${encodeURIComponent(input.calendarId)}/events`;
  const occurrence = googleEventSchema.parse(
    await gateway.request(`${path}/${encodeURIComponent(input.eventId)}`),
  );
  if (occurrence.etag !== input.write.etag) throw new CalendarProviderError(412, "event_changed");
  if (!occurrence.recurringEventId) return input;
  const master = googleEventSchema.parse(
    await gateway.request(`${path}/${encodeURIComponent(occurrence.recurringEventId)}`),
  );
  const event = { ...input.write.event };
  if (event.start)
    event.start = shiftSeriesTime(
      master.start as CalendarEventTime,
      occurrence.start as CalendarEventTime,
      event.start,
    );
  if (event.end)
    event.end = shiftSeriesTime(
      master.end as CalendarEventTime,
      occurrence.end as CalendarEventTime,
      event.end,
    );
  return { ...input, eventId: master.id, write: { ...input.write, etag: master.etag, event } };
}
export async function reconcileCalendarOperation(
  env: RuntimeEnv,
  input: { userId: string; workspaceId: string; operationId: string },
  supplied?: CalendarGateway,
) {
  const [receipt] = await db
    .select()
    .from(calendarMutationReceipt)
    .where(eq(calendarMutationReceipt.id, input.operationId));
  if (!receipt) throw new CalendarProviderError(404, "operation_unavailable");
  const { account, binding } = await requireCalendarBinding(
    input.userId,
    input.workspaceId,
    receipt.bindingId,
  );
  if (["succeeded", "failed"].includes(receipt.status)) return receipt.result;
  if (receipt.status === "pending" && Date.now() - receipt.updatedAt.getTime() < 60_000)
    return { operationId: receipt.id, status: "pending" };
  const gateway = supplied ?? (await createCalendarGateway(env, account));
  const destination =
    typeof receipt.steps.destination === "string" ? receipt.steps.destination : undefined;
  const context = { receipt, workspaceId: binding.workspaceId, accountId: account.id, destination };
  const result =
    receipt.steps.action === "split"
      ? await resumeSeriesSplit(receipt, binding.workspaceId, gateway)
      : await reconcileSingleOperation(context, gateway);
  if (result.status === "succeeded")
    await completeCalendarMutation(account.id, receipt.calendarId, result, destination);
  return result;
}
type OperationContext = {
  receipt: typeof calendarMutationReceipt.$inferSelect;
  workspaceId: string;
  accountId: string;
  destination?: string;
};
function reconciledEvent(context: OperationContext, raw: unknown): CalendarMutationResponse {
  const { receipt, workspaceId, destination } = context;
  return {
    operationId: receipt.id,
    status: "succeeded",
    event: normalizeEvent(
      raw,
      { bindingId: receipt.bindingId, workspaceId, calendarId: destination ?? receipt.calendarId },
      "UTC",
    ),
  };
}
async function reconcileSingleOperation(
  context: OperationContext,
  gateway: CalendarGateway,
): Promise<CalendarMutationResponse> {
  const { receipt, destination } = context;
  try {
    const raw = googleEventSchema.parse(
      await gateway.request(
        `/calendars/${encodeURIComponent(destination ?? receipt.calendarId)}/events/${encodeURIComponent(receipt.eventId)}`,
      ),
    );
    if (operationMarker(raw) === receipt.id) return reconciledEvent(context, raw);
  } catch (error) {
    if (!(error instanceof CalendarProviderError && error.status === 404)) throw error;
    if (receipt.steps.action === "delete") return { operationId: receipt.id, status: "succeeded" };
    if (receipt.steps.action === "move") return resumeMove(context, gateway);
  }
  return { operationId: receipt.id, status: "ambiguous" };
}
async function resumeMove(
  context: OperationContext,
  gateway: CalendarGateway,
): Promise<CalendarMutationResponse> {
  const { receipt, destination, accountId } = context;
  if (!destination) throw new CalendarProviderError(400, "destination_required");
  const path = `/calendars/${encodeURIComponent(receipt.calendarId)}/events/${encodeURIComponent(receipt.eventId)}`;
  const source = googleEventSchema.parse(await gateway.request(path));
  if (operationMarker(source) !== receipt.id)
    return { operationId: receipt.id, status: "ambiguous" };
  await writableCalendar(accountId, destination);
  const query = new URLSearchParams({
    destination,
    sendUpdates: String(receipt.steps.sendUpdates),
  });
  const moved = await gateway.request(`${path}/move?${query}`, {
    method: "POST",
    headers: { "If-Match": source.etag! },
  });
  return reconciledEvent(context, moved);
}

async function providerEventId(input: CalendarMutationInput) {
  return ["create", "duplicate"].includes(input.action)
    ? `cb${await sha256Hex(`${input.bindingId}:${input.write.operationId}`)}`
    : input.eventId;
}
