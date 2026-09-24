import {
  calendarEventKey,
  eventInstant,
  type CalendarEvent,
  type CalendarRecord,
} from "@zilobase/features/calendar";
import type { CalendarDatabase } from "../storage/calendar-database";
export type DueCalendarReminder = { key: string; event: CalendarEvent; expiresAt: number };
export function dueCalendarReminders(
  events: CalendarEvent[],
  calendars: CalendarRecord[],
  now: number,
  startedAt: number,
): DueCalendarReminder[] {
  return events.flatMap((event) => {
    const calendar = calendars.find((c) => c.id === event.calendarId);
    if (
      !calendar ||
      event.status === "cancelled" ||
      event.attendees.some((a) => a.self && a.responseStatus === "declined")
    )
      return [];
    const end = Date.parse(eventInstant(event.end, calendar.timeZone));
    if (end <= now) return [];
    const start = Date.parse(eventInstant(event.start, calendar.timeZone));
    const reminders = event.reminders.useDefault
      ? calendar.defaultReminders
      : (event.reminders.overrides ?? []);
    return reminders
      .filter(
        (r) =>
          r.method === "popup" &&
          start - r.minutes * 60_000 <= now &&
          start - r.minutes * 60_000 >= startedAt - 60_000,
      )
      .map((r) => ({
        key: JSON.stringify([
          calendarEventKey(event),
          event.originalStartTime ?? null,
          start,
          r.minutes,
        ]),
        event,
        expiresAt: end + 86400_000,
      }));
  });
}
export async function claimCalendarReminder(
  database: CalendarDatabase,
  reminder: DueCalendarReminder,
  now = Date.now(),
) {
  return database.transaction(
    "rw",
    database.reminders,
    database.events,
    database.pending,
    async () => {
      if (await database.reminders.get(reminder.key)) return false;
      const key = calendarEventKey(reminder.event),
        current = await database.events.get(key);
      if (
        !current ||
        current.event.status === "cancelled" ||
        JSON.stringify(current.event.start) !== JSON.stringify(reminder.event.start) ||
        (await database.pending.where("eventKey").equals(key).count())
      )
        return false;
      await database.reminders.where("expiresAt").below(now).delete();
      await database.reminders.add({ key: reminder.key, expiresAt: reminder.expiresAt });
      return true;
    },
  );
}
