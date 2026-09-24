import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  calendarBinding,
  calendarMutationReceipt,
  calendarNotificationOutbox,
  calendarProviderCalendar,
} from "../../../infrastructure/database/schema";
import type { CalendarMutationResponse } from "@zilobase/features/calendar";
import { CalendarProviderError } from "../provider/gateway";
import type { CalendarMutationInput } from "./mutations";
import { recordCalendarMetric } from "../metrics";
export async function existingCalendarMutation(input: CalendarMutationInput, hash: string) {
  const [receipt] = await db
    .select()
    .from(calendarMutationReceipt)
    .where(eq(calendarMutationReceipt.id, input.write.operationId));
  if (!receipt) return null;
  if (receipt.bindingId !== input.bindingId || receipt.requestHash !== hash)
    throw new CalendarProviderError(409, "operation_identity_conflict");
  return (
    receipt.result ?? { operationId: receipt.id, status: receipt.status as "pending" | "ambiguous" }
  );
}
export async function reserveCalendarMutation(
  accountId: string,
  input: CalendarMutationInput,
  hash: string,
  eventId: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`calendar-write:${accountId}:${input.calendarId}:${eventId}`}))`,
    );
    const [receipt] = await tx
      .select()
      .from(calendarMutationReceipt)
      .where(eq(calendarMutationReceipt.id, input.write.operationId));
    if (receipt) {
      if (receipt.bindingId !== input.bindingId || receipt.requestHash !== hash)
        throw new CalendarProviderError(409, "operation_identity_conflict");
      return (
        receipt.result ?? {
          operationId: receipt.id,
          status: receipt.status as "pending" | "ambiguous",
        }
      );
    }
    const [pending] = await tx
      .select()
      .from(calendarMutationReceipt)
      .innerJoin(calendarBinding, eq(calendarBinding.id, calendarMutationReceipt.bindingId))
      .where(
        and(
          eq(calendarBinding.accountId, accountId),
          eq(calendarMutationReceipt.calendarId, input.calendarId),
          eq(calendarMutationReceipt.eventId, eventId),
          inArray(calendarMutationReceipt.status, ["pending", "ambiguous"]),
        ),
      )
      .limit(1);
    if (pending) throw new CalendarProviderError(409, "event_operation_pending");
    await tx.insert(calendarMutationReceipt).values({
      id: input.write.operationId,
      bindingId: input.bindingId,
      requestHash: hash,
      calendarId: input.calendarId,
      eventId,
      steps: {
        action: input.action,
        destination: input.destination ?? null,
        sendUpdates: input.write.sendUpdates,
      },
    });
    return null;
  });
}
export async function failCalendarMutation(operationId: string, error: unknown) {
  const definite =
    error instanceof CalendarProviderError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![408, 429].includes(error.status);
  const result: CalendarMutationResponse = {
    operationId,
    status: definite ? "failed" : "ambiguous",
    error: error instanceof CalendarProviderError ? error.code : "delivery_uncertain",
  };
  await db
    .update(calendarMutationReceipt)
    .set({ status: result.status, result, updatedAt: new Date() })
    .where(eq(calendarMutationReceipt.id, operationId));
  if (definite) throw error;
  recordCalendarMetric("ambiguous_write", 1, "failure");
  return result;
}
export async function completeCalendarMutation(
  accountId: string,
  calendarId: string,
  result: CalendarMutationResponse,
  destination?: string,
) {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(calendarMutationReceipt)
      .set({ status: result.status, result, updatedAt: new Date() })
      .where(
        and(
          eq(calendarMutationReceipt.id, result.operationId),
          inArray(calendarMutationReceipt.status, ["pending", "ambiguous"]),
        ),
      )
      .returning();
    if (!updated) return;
    for (const id of new Set([calendarId, ...(destination ? [destination] : [])])) {
      const [state] = await tx
        .update(calendarProviderCalendar)
        .set({ revision: sql`${calendarProviderCalendar.revision} + 1`, dirtyAt: new Date() })
        .where(
          and(
            eq(calendarProviderCalendar.accountId, accountId),
            eq(calendarProviderCalendar.calendarId, id),
          ),
        )
        .returning();
      if (state)
        await tx.insert(calendarNotificationOutbox).values({
          id: crypto.randomUUID(),
          accountId,
          calendarId: id,
          generation: state.generation,
          revision: state.revision,
        });
    }
  });
}
