import { recordCalendarMetric } from "../metrics";
import { and, eq, isNull, lt, or, sql, notInArray } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  calendarAccount,
  calendarBinding,
  calendarEventRecord,
  calendarProviderCalendar,
  calendarNotificationOutbox,
} from "../../../infrastructure/database/schema";
import { type RuntimeEnv } from "../../../shared/config/config";
import { CalendarGateway, CalendarProviderError, normalizeEvent } from "../provider/gateway";
import { createCalendarGateway } from "../provider/oauth";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import { dispatchBackgroundTasks } from "../../../infrastructure/background/dispatch";
export async function refreshCalendarList(
  accountId: string,
  bindingId: string,
  gateway: CalendarGateway,
) {
  const calendars = await gateway.calendars(bindingId);
  await db.transaction(async (tx) => {
    for (const calendar of calendars)
      await tx
        .insert(calendarProviderCalendar)
        .values({ accountId, calendarId: calendar.id, data: calendar, dirtyAt: new Date() })
        .onConflictDoUpdate({
          target: [calendarProviderCalendar.accountId, calendarProviderCalendar.calendarId],
          set: { data: calendar },
        });
    const oldCalendars = await tx
      .select()
      .from(calendarProviderCalendar)
      .where(eq(calendarProviderCalendar.accountId, accountId));
    for (const old of oldCalendars)
      if (!calendars.some((calendar) => calendar.id === old.calendarId)) {
        await tx.insert(calendarNotificationOutbox).values({
          id: crypto.randomUUID(),
          accountId,
          calendarId: old.calendarId,
          revision: old.revision + 1,
          generation: old.generation,
        });
      }
    await tx.delete(calendarProviderCalendar).where(
      and(
        eq(calendarProviderCalendar.accountId, accountId),
        calendars.length
          ? notInArray(
              calendarProviderCalendar.calendarId,
              calendars.map((c) => c.id),
            )
          : undefined,
      ),
    );
  });
  return calendars;
}
export async function queueCalendarSync(env: RuntimeEnv, accountId: string, calendarId: string) {
  await db
    .update(calendarProviderCalendar)
    .set({ dirtyAt: new Date() })
    .where(
      and(
        eq(calendarProviderCalendar.accountId, accountId),
        eq(calendarProviderCalendar.calendarId, calendarId),
      ),
    );
  await dispatchBackgroundTasks(env, [
    createBackgroundTask({
      env,
      kind: "calendar.sync",
      resourceId: JSON.stringify([accountId, calendarId]),
    }),
  ]);
}
export async function advanceCalendarSync(
  env: RuntimeEnv,
  accountId: string,
  calendarId: string,
  suppliedGateway?: CalendarGateway,
): Promise<boolean> {
  const owner = await syncOwner(accountId);
  if (!owner) return false;
  const { account, binding } = owner;
  const scope = and(
    eq(calendarProviderCalendar.accountId, accountId),
    eq(calendarProviderCalendar.calendarId, calendarId),
  );
  const leaseId = crypto.randomUUID();
  const [state] = await db
    .update(calendarProviderCalendar)
    .set({ leaseId, leaseExpiresAt: new Date(Date.now() + 60_000) })
    .where(
      and(
        scope,
        or(
          isNull(calendarProviderCalendar.leaseExpiresAt),
          lt(calendarProviderCalendar.leaseExpiresAt, new Date()),
        ),
      ),
    )
    .returning();
  if (!state) return true;
  recordCalendarMetric("sync_lag", syncLag(state.dirtyAt));
  try {
    const gateway = suppliedGateway ?? (await createCalendarGateway(env, account));
    const response = await gateway.events(calendarId, syncParameters(state));
    if (!response.nextPageToken && !response.nextSyncToken)
      throw new CalendarProviderError(502, "missing_sync_checkpoint");
    return await db.transaction(async (tx) => {
      const [fenced] = await tx
        .update(calendarProviderCalendar)
        .set({
          pageToken: response.nextPageToken ?? null,
          syncToken: nextSyncToken(response, state),
          leaseId: null,
          leaseExpiresAt: null,
          ...(response.nextPageToken
            ? {}
            : {
                revision: sql`${calendarProviderCalendar.revision} + 1`,
                dirtyAt: sql`case when ${calendarProviderCalendar.dirtyAt} = ${state.dirtyAt?.toISOString() ?? null}::timestamptz then null else ${calendarProviderCalendar.dirtyAt} end`,
              }),
        })
        .where(and(scope, eq(calendarProviderCalendar.leaseId, leaseId)))
        .returning();
      if (!fenced) return true;
      for (const raw of response.items ?? []) {
        const data = normalizeEvent(
          raw,
          { workspaceId: binding.workspaceId, bindingId: binding.id, calendarId },
          state.data.timeZone,
        );
        await tx
          .insert(calendarEventRecord)
          .values({
            accountId,
            calendarId,
            eventId: data.eventId,
            data,
            generation: state.generation,
          })
          .onConflictDoUpdate({
            target: [
              calendarEventRecord.accountId,
              calendarEventRecord.calendarId,
              calendarEventRecord.eventId,
            ],
            set: { data, generation: state.generation },
          });
      }
      if (!response.nextPageToken) {
        await tx
          .delete(calendarEventRecord)
          .where(
            and(
              eq(calendarEventRecord.accountId, accountId),
              eq(calendarEventRecord.calendarId, calendarId),
              lt(calendarEventRecord.generation, state.generation),
            ),
          );
        await tx.insert(calendarNotificationOutbox).values({
          id: crypto.randomUUID(),
          accountId,
          calendarId,
          revision: fenced.revision,
          generation: fenced.generation,
        });
      }
      return Boolean(response.nextPageToken || fenced.dirtyAt);
    });
  } catch (error) {
    if (error instanceof CalendarProviderError && error.status === 410) {
      await db
        .update(calendarProviderCalendar)
        .set({
          syncToken: null,
          pageToken: null,
          generation: sql`${calendarProviderCalendar.generation} + 1`,
          dirtyAt: new Date(),
        })
        .where(and(scope, eq(calendarProviderCalendar.leaseId, leaseId)));
      return true;
    }
    throw error;
  } finally {
    await db
      .update(calendarProviderCalendar)
      .set({ leaseId: null, leaseExpiresAt: null })
      .where(and(scope, eq(calendarProviderCalendar.leaseId, leaseId)));
  }
}
export async function advancePendingCalendars(env: RuntimeEnv) {
  const rows = await db
    .select()
    .from(calendarProviderCalendar)
    .where(
      or(
        sql`${calendarProviderCalendar.dirtyAt} is not null`,
        sql`${calendarProviderCalendar.pageToken} is not null`,
      ),
    )
    .limit(10);
  for (const row of rows) await advanceCalendarSync(env, row.accountId, row.calendarId);
}

async function syncOwner(accountId: string) {
  const [binding] = await db
    .select()
    .from(calendarBinding)
    .where(eq(calendarBinding.accountId, accountId));
  if (!binding) return null;
  const [account] = await db
    .select()
    .from(calendarAccount)
    .where(eq(calendarAccount.id, accountId));
  if (!account || account.status !== "connected") return null;
  return { account, binding };
}

function syncParameters(state: { syncToken: string | null; pageToken: string | null }) {
  return {
    maxResults: "500",
    singleEvents: "false",
    showDeleted: "true",
    ...(state.syncToken ? { syncToken: state.syncToken } : {}),
    ...(state.pageToken ? { pageToken: state.pageToken } : {}),
  };
}

function syncLag(dirtyAt: Date | null) {
  return dirtyAt ? Math.max(0, Date.now() - dirtyAt.getTime()) : 0;
}

function nextSyncToken(response: { nextSyncToken?: string }, state: { syncToken: string | null }) {
  return response.nextSyncToken ?? state.syncToken;
}
