import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import {
  calendarAccount,
  calendarBinding,
  calendarProviderCalendar,
  calendarWatchChannel,
} from "../../infrastructure/database/schema";
import {
  createBackgroundTask,
  type BackgroundTaskResult,
} from "../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../infrastructure/background/dispatch";
import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import { advanceCalendarSync, queueCalendarSync, refreshCalendarList } from "./sync/sync";
import { createCalendarGateway } from "./provider/oauth";
import { maintainAccountWatches } from "./realtime/watches";
import { drainCalendarOutbox } from "./realtime/outbox";

export async function dispatchCalendarWebhook(
  env: RuntimeEnv,
  accountId: string,
  calendarId: string | null,
) {
  await dispatchBackgroundTasks(env, [
    createBackgroundTask({
      env,
      kind: "calendar.sync",
      resourceId: JSON.stringify([accountId, calendarId]),
    }),
  ]);
}

export async function processCalendarSyncTask(
  env: RuntimeEnv,
  resourceId: string,
): Promise<BackgroundTaskResult> {
  let ids: unknown;
  try {
    ids = JSON.parse(resourceId);
  } catch {
    return { outcome: "terminal", errorCode: "invalid_calendar_task" };
  }
  if (
    !Array.isArray(ids) ||
    ids.length !== 2 ||
    typeof ids[0] !== "string" ||
    (ids[1] !== null && typeof ids[1] !== "string")
  )
    return { outcome: "terminal", errorCode: "invalid_calendar_task" };
  let pending = false;
  if (ids[1] === null) await refreshAccountCalendars(env, ids[0]);
  else {
    const [state] = await db
      .select()
      .from(calendarProviderCalendar)
      .where(
        and(
          eq(calendarProviderCalendar.accountId, ids[0]),
          eq(calendarProviderCalendar.calendarId, ids[1]),
        ),
      );
    if (state && (state.dirtyAt || state.pageToken))
      pending = await advanceCalendarSync(env, ids[0], ids[1]);
  }
  await drainCalendarOutbox();
  return pending
    ? { outcome: "retry", availableAt: new Date(Date.now() + 5000).toISOString() }
    : { outcome: "completed" };
}

async function refreshAccountCalendars(env: RuntimeEnv, accountId: string) {
  const [binding] = await db
    .select()
    .from(calendarBinding)
    .where(eq(calendarBinding.accountId, accountId));
  const [account] = await db
    .select()
    .from(calendarAccount)
    .where(eq(calendarAccount.id, accountId));
  if (!binding || !account || account.status !== "connected") return;
  const checkpoint = new Date();
  const calendars = await refreshCalendarList(
    accountId,
    binding.id,
    await createCalendarGateway(env, account),
  );
  for (const calendar of calendars.filter(
    (calendar) => calendar.permissions.read && !calendar.permissions.freeBusyOnly,
  ))
    await queueCalendarSync(env, accountId, calendar.id);
  await db
    .update(calendarWatchChannel)
    .set({ dirtyAt: null })
    .where(
      and(
        eq(calendarWatchChannel.accountId, accountId),
        isNull(calendarWatchChannel.calendarId),
        lte(calendarWatchChannel.dirtyAt, checkpoint),
      ),
    );
  const address = getStringEnv(env, "CALENDAR_WEBHOOK_URL");
  if (address) await maintainAccountWatches(account, env, address);
}
