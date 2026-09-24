import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  calendarProviderCalendar,
  calendarWatchChannel,
} from "../../../infrastructure/database/schema";
export function coveredWatchExpiry(
  desired: (string | null)[],
  channels: { calendarId: string | null; status: string; expiresAt: Date }[],
  now = Date.now(),
) {
  const expiries = desired.map((id) =>
    Math.max(
      0,
      ...channels
        .filter((channel) => channel.calendarId === id && channel.status === "active")
        .map((channel) => channel.expiresAt.getTime()),
    ),
  );
  const expiresAt = Math.min(...expiries);
  return Number.isFinite(expiresAt) && expiresAt > now ? new Date(expiresAt).toISOString() : null;
}
export async function calendarWatchExpiry(accountId: string) {
  const [calendars, channels] = await Promise.all([
    db
      .select()
      .from(calendarProviderCalendar)
      .where(eq(calendarProviderCalendar.accountId, accountId)),
    db.select().from(calendarWatchChannel).where(eq(calendarWatchChannel.accountId, accountId)),
  ]);
  return coveredWatchExpiry(
    [
      null,
      ...calendars
        .filter(
          (calendar) => calendar.data.permissions.read && !calendar.data.permissions.freeBusyOnly,
        )
        .map((calendar) => calendar.calendarId),
    ],
    channels,
  );
}
