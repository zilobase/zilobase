import { emitCalendarMetric } from "../metrics";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@zilobase/features/auth/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import {
  addCalendarDays,
  dayInstant,
  todayInZone,
  eventClock,
  type CalendarConnection,
  type CalendarPreferences,
} from "@zilobase/features/calendar";
import { toast } from "sonner";
import { useCalendarAccounts } from "../connections/use-calendar-accounts";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";
import { useCalendarCache } from "../sync/use-calendar-cache";
import { dueCalendarReminders, claimCalendarReminder } from "./scheduler";
import { deliverCalendarSystemNotification } from "./notification-delivery";
export default function CalendarReminderHost() {
  const workspaceId = useActiveWorkspaceId(),
    { data: session } = useSession();
  return workspaceId && session?.user?.id ? (
    <WorkspaceReminders
      key={`${workspaceId}:${session.user.id}`}
      workspaceId={workspaceId}
      userId={session.user.id}
    />
  ) : null;
}
function WorkspaceReminders({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const { accounts } = useCalendarAccounts(workspaceId),
    { query } = useCalendarPreferences(workspaceId);
  if (!query.data?.remindersEnabled) return null;
  return (
    <>
      {accounts.data?.connections
        .filter((c) => c.status === "connected")
        .map((connection) => (
          <AccountReminders
            key={connection.bindingId}
            connection={connection}
            userId={userId}
            preferences={query.data!}
          />
        ))}
    </>
  );
}
function AccountReminders({
  connection,
  userId,
  preferences,
}: {
  connection: CalendarConnection;
  userId: string;
  preferences: CalendarPreferences;
}) {
  const [now, setNow] = useState(Date.now),
    startedAt = useRef(Date.now()),
    busy = useRef(false);
  const today = todayInZone(preferences.timeZone);
  const cache = useCalendarCache(
    connection,
    userId,
    dayInstant(addCalendarDays(today, -1), preferences.timeZone),
    dayInstant(addCalendarDays(today, 29), preferences.timeZone),
  );
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 15_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!cache.database || !cache.events || !cache.calendars || busy.current) return;
    const database = cache.database;
    const reminders = dueCalendarReminders(cache.events, cache.calendars, now, startedAt.current);
    busy.current = true;
    void (async () => {
      for (const reminder of reminders) {
        if (!active || !database.isOpen()) break;
        if (!(await claimCalendarReminder(database, reminder, now)) || !active) continue;
        const body = `${eventClock(reminder.event.start, preferences.timeZone, preferences.timeFormat)}${reminder.event.location ? ` · ${reminder.event.location}` : ""}`;
        emitCalendarMetric("reminder", 1);
        toast(reminder.event.title, { description: body, duration: 15_000 });
        try {
          await deliverCalendarSystemNotification(reminder.event.title, body, reminder.key);
        } catch {
          /* In-app delivery remains available when system notifications fail. */
        }
      }
    })()
      .catch(() => {})
      .finally(() => {
        busy.current = false;
      });
    return () => {
      active = false;
    };
  }, [
    cache.database,
    cache.events,
    cache.calendars,
    now,
    preferences.timeZone,
    preferences.timeFormat,
  ]);
  return null;
}
