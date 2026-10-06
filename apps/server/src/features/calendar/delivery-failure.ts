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
