import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import {
  calendarProviderCalendar,
  calendarWatchChannel,
} from "../../infrastructure/database/schema";

export async function failCalendarDelivery(resourceId: string, availableAt: string) {
  const ids: unknown = JSON.parse(resourceId);
  if (
    !Array.isArray(ids) ||
    typeof ids[0] !== "string" ||
    !(ids[1] === null || typeof ids[1] === "string")
  )
    return true;
  if (ids[1] === null) {
    await db
      .update(calendarWatchChannel)
      .set({ dirtyAt: null })
      .where(
        and(
          eq(calendarWatchChannel.accountId, ids[0]),
          isNull(calendarWatchChannel.calendarId),
          lte(calendarWatchChannel.dirtyAt, new Date(availableAt)),
        ),
      );
    return true;
  }
  const scope = and(
    eq(calendarProviderCalendar.accountId, ids[0]),
    eq(calendarProviderCalendar.calendarId, ids[1]),
  );
  const [row] = await db.select().from(calendarProviderCalendar).where(scope).limit(1);
  if (!row) return true;
  if (row.leaseExpiresAt && row.leaseExpiresAt > new Date()) return false;
  await db
    .update(calendarProviderCalendar)
    .set({ dirtyAt: null, pageToken: null, leaseId: null, leaseExpiresAt: null })
    .where(
      and(
        scope,
        or(
          isNull(calendarProviderCalendar.dirtyAt),
          lte(calendarProviderCalendar.dirtyAt, new Date(availableAt)),
        ),
        or(
          isNull(calendarProviderCalendar.leaseExpiresAt),
          lte(calendarProviderCalendar.leaseExpiresAt, sql`current_timestamp`),
        ),
      ),
    );
  return true;
}

export async function prepareCalendarReplay(resourceId: string) {
  const ids: unknown = JSON.parse(resourceId);
  if (
    !Array.isArray(ids) ||
    ids.length !== 2 ||
    typeof ids[0] !== "string" ||
    !(ids[1] === null || typeof ids[1] === "string")
  )
    throw new Error("REPLAY_CALENDAR_TASK_INVALID");
  const { calendarAccount, calendarBinding } = await import("../../infrastructure/database/schema");
  const [account] = await db
    .select()
    .from(calendarAccount)
    .where(and(eq(calendarAccount.id, ids[0]), eq(calendarAccount.status, "connected")))
    .limit(1);
  const [binding] = await db
    .select()
    .from(calendarBinding)
    .where(eq(calendarBinding.accountId, ids[0]))
    .limit(1);
  if (!account || !binding) throw new Error("REPLAY_CALENDAR_ACCOUNT_UNAVAILABLE");
  if (ids[1] === null) {
    await db
      .update(calendarWatchChannel)
      .set({ dirtyAt: new Date() })
      .where(
        and(eq(calendarWatchChannel.accountId, ids[0]), isNull(calendarWatchChannel.calendarId)),
      );
    return;
  }
  const scope = and(
    eq(calendarProviderCalendar.accountId, ids[0]),
    eq(calendarProviderCalendar.calendarId, ids[1]),
  );
  const [row] = await db.select().from(calendarProviderCalendar).where(scope).for("update");
  if (
    !row ||
    row.dirtyAt ||
    row.pageToken ||
    !row.data.permissions.read ||
    row.data.permissions.freeBusyOnly ||
    (row.leaseExpiresAt && row.leaseExpiresAt > new Date())
  )
    throw new Error("REPLAY_CALENDAR_INELIGIBLE");
  await db
    .update(calendarProviderCalendar)
    .set({
      dirtyAt: new Date(),
      pageToken: null,
      syncToken: null,
      leaseId: null,
      leaseExpiresAt: null,
    })
    .where(scope);
}
