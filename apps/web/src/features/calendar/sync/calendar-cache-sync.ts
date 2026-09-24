import { emitCalendarMetric } from "../metrics";
import { requestCalendarIntervals } from "./calendar-range-queue";
import { missingCalendarRanges } from "./range-coverage";
import { runCalendarSyncOnce } from "./calendar-sync-queue";
import {
  calendarApiBasePath,
  type CalendarRangeResponse,
  type CalendarSyncResponse,
} from "@zilobase/features/calendar";
import {
  applyCalendarRange,
  calendarBufferBudgetAvailable,
  calendarRangeKey,
  evictCalendarRanges,
  type CalendarDatabase,
} from "../storage/calendar-database";
type Transport = <T>(path: string, options?: RequestInit) => Promise<T>;
export async function synchronizeCalendarCache(
  database: CalendarDatabase,
  start: string,
  end: string,
  fetcher: Transport,
  recover = true,
  options: {
    missingOnly?: boolean;
    priority?: number;
    metadataLoaded?: boolean;
    hiddenKeys?: string[];
    requestId?: string;
    isCurrent?: () => boolean;
    signal?: AbortSignal;
    accountId?: string;
  } = {},
) {
  return (async () => {
    if (options.isCurrent && !options.isCurrent()) return;
    const base = `${calendarApiBasePath(database.identity.workspaceId)}/connections/${encodeURIComponent(database.identity.bindingId)}`;
    let sync: Pick<CalendarSyncResponse, "calendars"> = {
      calendars: await database.calendars.toArray(),
    };
    const storeMetadata = async () => {
      await database.transaction(
        "rw",
        database.calendars,
        database.ranges,
        database.events,
        database.state,
        async () => {
          const current = new Set(sync.calendars.map((calendar) => calendar.id));
          for (const old of await database.calendars.toArray())
            if (!current.has(old.id)) {
              await database.ranges.where("calendarId").equals(old.id).delete();
              await database.state.delete(old.id);
              await database.events.filter((row) => row.event.calendarId === old.id).delete();
            }
          await database.calendars.clear();
          await database.calendars.bulkPut(sync.calendars);
        },
      );
    };
    const recoverMetadata = async () => {
      const last = await database.state.get("last_recovery");
      if (last && Date.now() - last.revision < 15_000) {
        sync = { calendars: await database.calendars.toArray() };
        return;
      }
      sync = await fetcher<CalendarSyncResponse>(`${base}/sync`, { method: "POST", body: "{}" });
      if (!database.isOpen()) return;
      await storeMetadata();
      await database.state.put({ key: "last_recovery", revision: Date.now(), generation: 1 });
    };
    await runCalendarSyncOnce(
      database,
      JSON.stringify(["metadata", recover, options.metadataLoaded]),
      async () => {
        if (recover) {
          if (typeof navigator !== "undefined" && navigator.locks)
            await navigator.locks.request(`${database.name}:provider-recovery`, recoverMetadata);
          else await recoverMetadata();
        } else if (!options.metadataLoaded) {
          sync = await fetcher<Pick<CalendarSyncResponse, "calendars">>(`${base}/catalog`);
          if (!database.isOpen()) return;
          await storeMetadata();
        }
        if (!database.isOpen()) return;
      },
      options.priority,
    );
    const pinned: string[] = [];
    sync = { calendars: await database.calendars.toArray() };
    await Promise.all(
      sync.calendars
        .filter((c) => readableCalendar(c, options.hiddenKeys, database.identity.bindingId))
        .map((calendar) =>
          syncCalendarRanges(database, calendar, start, end, base, fetcher, options, pinned),
        ),
    );
    await evictCalendarRanges(database, pinned);
  })();
}

function readableCalendar(
  calendar: { permissions: { read: boolean; freeBusyOnly: boolean }; id: string },
  hiddenKeys: string[] | undefined,
  bindingId: string,
) {
  return (
    calendar.permissions.read &&
    !calendar.permissions.freeBusyOnly &&
    !hiddenKeys?.includes(JSON.stringify([bindingId, calendar.id]))
  );
}
async function syncCalendarRanges(
  database: CalendarDatabase,
  calendar: { id: string },
  start: string,
  end: string,
  base: string,
  fetcher: Transport,
  options: {
    missingOnly?: boolean;
    priority?: number;
    isCurrent?: () => boolean;
    accountId?: string;
    signal?: AbortSignal;
    hiddenKeys?: string[];
  },
  pinned: string[],
) {
  const cached = await database.ranges.where("calendarId").equals(calendar.id).toArray();
  const dense = await database.state.get(`density:${calendar.id}`);
  const requested = options.missingOnly
    ? missingCalendarRanges(start, end, cached)
    : [{ start, end }];
  pinned.push(
    ...cached
      .filter((r) => Date.parse(r.start) < Date.parse(end) && Date.parse(r.end) > Date.parse(start))
      .map((r) => r.key),
  );
  for (const request of requested)
    await requestCalendarChunks(database, calendar, request, dense, base, fetcher, options, pinned);
}
async function requestCalendarChunks(
  database: CalendarDatabase,
  calendar: { id: string },
  request: { start: string; end: string },
  dense: { revision?: number } | undefined,
  base: string,
  fetcher: Transport,
  options: {
    priority?: number;
    isCurrent?: () => boolean;
    accountId?: string;
    signal?: AbortSignal;
    missingOnly?: boolean;
  },
  pinned: string[],
) {
  for (const range of calendarRequestRanges(request.start, request.end, dense?.revision ? 7 : 28)) {
    if (shouldStopCalendarChunks(options, database)) return;
    await requestCalendarIntervals(
      `${database.name}:${calendar.id}`,
      JSON.stringify([
        database.identity.apiOrigin,
        database.identity.userId,
        options.accountId ?? database.identity.bindingId,
      ]),
      range,
      (span, signal) =>
        loadLockedCalendarRange(database, calendar.id, base, fetcher, options, span, signal),
      options.priority,
      options.signal,
    );
    pinned.push(calendarRangeKey(calendar.id, range.start, range.end));
  }
}
function shouldStopCalendarChunks(
  options: { isCurrent?: () => boolean; priority?: number },
  database: CalendarDatabase,
) {
  if (options.isCurrent && !options.isCurrent()) return true;
  return (options.priority ?? 0) < 10 && !calendarBufferBudgetAvailable(database);
}
async function loadLockedCalendarRange(
  database: CalendarDatabase,
  calendarId: string,
  base: string,
  fetcher: Transport,
  options: { missingOnly?: boolean },
  span: { start: string; end: string },
  signal: AbortSignal,
) {
  const load = () =>
    loadCalendarRangePages(database, calendarId, base, fetcher, options, span, signal);
  if (typeof navigator !== "undefined" && navigator.locks)
    await navigator.locks.request(
      `${database.name}:range:${calendarId}:${span.start}:${span.end}`,
      { signal },
      load,
    );
  else await load();
}
async function loadCalendarRangePages(
  database: CalendarDatabase,
  calendarId: string,
  base: string,
  fetcher: Transport,
  options: { missingOnly?: boolean },
  span: { start: string; end: string },
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const covered = await database.ranges.where("calendarId").equals(calendarId).toArray();
  if (options.missingOnly && !missingCalendarRanges(span.start, span.end, covered).length) return;
  const prior = await database.ranges.get(calendarRangeKey(calendarId, span.start, span.end));
  const state = await database.state.get(calendarId);
  if (freshCalendarRange(prior, state)) return;
  let pageToken: string | null = null,
    pages = 0;
  do {
    const params: URLSearchParams = new URLSearchParams({
      calendarId,
      start: span.start,
      end: span.end,
      ...(pageToken ? { pageToken } : {}),
    });
    const response: CalendarRangeResponse = await fetcher<CalendarRangeResponse>(
      `${base}/ranges?${params}`,
      { signal },
    );
    if (!database.isOpen()) return;
    pages++;
    if (pages > 1)
      await database.state.put({ key: `density:${calendarId}`, revision: 1, generation: 1 });
    await applyCalendarRange(database, response);
    pageToken = response.nextPageToken;
    signal.throwIfAborted();
  } while (pageToken);
  emitCalendarMetric("range_pages", pages);
}
function freshCalendarRange(
  prior: { fetchedAt: number; revision: number; generation: number } | undefined,
  state: { revision: number; generation: number } | undefined,
) {
  return Boolean(
    prior &&
    Date.now() - prior.fetchedAt < 2000 &&
    (!state || (state.revision <= prior.revision && state.generation <= prior.generation)),
  );
}
// Keep moving month windows within the server's 62-day per-request limit.
function calendarRequestRanges(start: string, end: string, chunkDays = 28) {
  const ranges: { start: string; end: string }[] = [];
  let cursor = Date.parse(start);
  const until = Date.parse(end);
  while (cursor < until) {
    const next = Math.min(until, cursor + Math.min(60, Math.max(1, chunkDays)) * 86400_000);
    ranges.push({ start: new Date(cursor).toISOString(), end: new Date(next).toISOString() });
    cursor = next;
  }
  return ranges;
}
