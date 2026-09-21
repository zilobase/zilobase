import { emitCalendarMetric } from "../metrics";
import { coversCalendarRange, type CalendarWindow } from "./range-coverage";
import { useQueryClient } from "@tanstack/react-query";
import { calendarEventKey, calendarKeys } from "@zilobase/features/calendar";
import { startCalendarRecovery } from "../realtime/calendar-recovery";
import { reconcileCalendarMutations } from "../events/calendar-mutations";
import { useEffect, useState, useCallback, useSyncExternalStore, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { CalendarConnection } from "@zilobase/features/calendar";
import { apiFetch, toApiUrl } from "@/platform/network/api";
import { getConnectivityState, subscribeConnectivity } from "@/platform/network/connectivity";
import { openCalendarDatabase, readCalendarRangeCache, type CalendarDatabase } from "../storage/calendar-database";
import { synchronizeCalendarCache } from "./calendar-cache-sync";
export function useCalendarCache(connection: CalendarConnection, userId: string, start: string, end: string, options?: { target?: CalendarWindow | null; hiddenKeys: string[] }) {
  const targetStart = options?.target?.start, targetEnd = options?.target?.end;
  const hiddenKey = JSON.stringify(options?.hiddenKeys ?? []);
  const requestKey = JSON.stringify([userId, connection.workspaceId, connection.bindingId, start, end, targetStart, targetEnd, hiddenKey]);
  const [readLatencyMs, setReadLatency] = useState(1000);
  const separateTarget = isSeparateTarget(targetStart, targetEnd, start, end);
  // Moving inside this window must not reread every buffered event.
  const materializationKey = calendarMaterializationKey(userId, connection, start, end, hiddenKey, separateTarget, targetStart, targetEnd);
  const client = useQueryClient();
  const [database, setDatabase] = useState<CalendarDatabase | null>(null), [error, setError] = useState<unknown>(), [syncing, setSyncing] = useState(false);
  const online = useSyncExternalStore(subscribeConnectivity, () => getConnectivityState() === "online", () => true);
  useEffect(() => openBoundCalendarDatabase(connection, userId, setDatabase, setError), [connection.bindingId, connection.workspaceId, userId]);
  const activeRequest = useRef(0);
  const readController = useRef<AbortController | null>(null);
  useEffect(() => { activeRequest.current++; return () => { activeRequest.current++; readController.current?.abort(); } }, [database, online]);
  const refresh = useCallback(async (recover = true, missingOnly = false) => beginCalendarRefresh({ database, online, activeRequest, readController, connection, client, hiddenKey, missingOnly, recover, targetStart, targetEnd, start, end, requestKey, setReadLatency, setError, setSyncing }), [database, requestKey, online]);
  const initialized = useRef<string | null>(null);
  useEffect(() => { void refresh(markCalendarInitialized(database, initialized), Boolean(options)); }, [refresh, database]);

  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => bindCalendarRecovery(database, online, refreshRef), [database, online]);
  useEffect(() => bindCalendarMutationReconcile(database, online), [database, online]);
  const cached = useLiveQuery(() => readCalendarSnapshot(database, userId, connection, requestKey, hiddenKey, start, end, separateTarget, targetStart, targetEnd), [database, materializationKey]);
  return calendarCacheState(cached, readLatencyMs, database, refresh, error, syncing, online);
}
async function refreshCalendarWindows(input: {
  database: CalendarDatabase; connection: CalendarConnection; client: ReturnType<typeof useQueryClient>; hiddenKey: string; missingOnly: boolean; recover: boolean;
  targetStart?: string; targetEnd?: string; start: string; end: string; requestKey: string; generation: number; current: () => boolean; controller: AbortController;
  setReadLatency: (value: number | ((old: number) => number)) => void; setError: (value: unknown) => void;
}) {
  const hiddenKeys: string[] = JSON.parse(input.hiddenKey);
  const metadataLoaded = input.missingOnly && Boolean(await input.database.state.get("last_recovery"));
  const began = performance.now();
  await refreshTargetWindow(input, hiddenKeys, metadataLoaded);
  if (!input.current()) return null;
  recordForegroundLatency(input, began);
  await synchronizeCalendarCache(input.database, input.start, input.end, apiFetch, input.targetStart ? false : input.recover, { missingOnly: input.missingOnly, accountId: input.connection.accountId, signal: input.controller.signal, metadataLoaded: Boolean(input.targetStart) || metadataLoaded, hiddenKeys, requestId: `${input.requestKey}:${input.generation}`, isCurrent: input.current });
  if (input.database.isOpen()) input.client.setQueryData(calendarKeys.calendars(input.connection), { calendars: await input.database.calendars.toArray() });
  if (input.current()) input.setError(undefined);
  return true;
}
async function refreshTargetWindow(input: Parameters<typeof refreshCalendarWindows>[0], hiddenKeys: string[], metadataLoaded: boolean) {
  if (!input.targetStart || !input.targetEnd) return;
  await synchronizeCalendarCache(input.database, input.targetStart, input.targetEnd, apiFetch, input.recover, { missingOnly: input.missingOnly, metadataLoaded, accountId: input.connection.accountId, hiddenKeys, priority: 10, signal: input.controller.signal, requestId: `${input.requestKey}:${input.generation}:target`, isCurrent: input.current });
}
async function beginCalendarRefresh(input: {
  database: CalendarDatabase | null; online: boolean; activeRequest: { current: number }; readController: { current: AbortController | null };
  connection: CalendarConnection; client: ReturnType<typeof useQueryClient>; hiddenKey: string; missingOnly: boolean; recover: boolean;
  targetStart?: string; targetEnd?: string; start: string; end: string; requestKey: string;
  setReadLatency: (value: number | ((old: number) => number)) => void; setError: (value: unknown) => void; setSyncing: (value: boolean) => void;
}) {
  if (!input.database || !input.online) return null;
  const generation = ++input.activeRequest.current;
  const prior = input.readController.current;
  const controller = new AbortController(); input.readController.current = controller;
  setTimeout(() => prior?.abort(), 100);
  input.setSyncing(true);
  return runCalendarRefresh({ ...input, database: input.database, generation, current: () => generation === input.activeRequest.current, controller });
}
async function runCalendarRefresh(input: Parameters<typeof refreshCalendarWindows>[0] & { setSyncing: (value: boolean) => void }) {
  try { return await refreshCalendarWindows(input); }
  catch (cause) { if (input.current()) input.setError(cause); return null; }
  finally { if (input.current()) input.setSyncing(false); }
}
function markCalendarInitialized(database: CalendarDatabase | null, initialized: { current: string | null }) {
  const recover = Boolean(database && initialized.current !== database.name);
  if (database) initialized.current = database.name;
  return recover;
}
function calendarMaterializationKey(userId: string, connection: CalendarConnection, start: string, end: string, hiddenKey: string, separateTarget: boolean, targetStart?: string, targetEnd?: string) {
  return JSON.stringify([userId, connection.workspaceId, connection.bindingId, start, end, hiddenKey, separateTarget ? targetStart : null, separateTarget ? targetEnd : null]);
}
function calendarCacheState(cached: Awaited<ReturnType<typeof readCalendarSnapshot>> | undefined, readLatencyMs: number, database: CalendarDatabase | null, refresh: (recover?: boolean, missingOnly?: boolean) => Promise<unknown>, error: unknown, syncing: boolean, online: boolean) {
  return { readLatencyMs, events: cached?.events, calendars: cached?.calendars, coverage: cached?.coverage, catalogLoaded: cached?.catalogLoaded, loaded: cached?.loaded, stale: cached?.stale, requestKey: cached?.requestKey, database, refresh, error, syncing, online };
}
function isSeparateTarget(targetStart: string | undefined, targetEnd: string | undefined, start: string, end: string) {
  return Boolean(targetStart && targetEnd && (Date.parse(targetStart) < Date.parse(start) || Date.parse(targetEnd) > Date.parse(end)));
}
function openBoundCalendarDatabase(connection: CalendarConnection, userId: string, setDatabase: (value: CalendarDatabase | null) => void, setError: (value: unknown) => void) {
  let active = true; setDatabase(null);
  void openCalendarDatabase({ apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin, userId, workspaceId: connection.workspaceId, bindingId: connection.bindingId }).then(db => { if (active) setDatabase(db); }).catch(setError);
  return () => { active = false; };
}
function bindCalendarRecovery(database: CalendarDatabase | null, online: boolean, refreshRef: { current: (recover?: boolean, missingOnly?: boolean) => Promise<unknown> }) {
  if (!database || !online) return;
  return startCalendarRecovery(database, recover => refreshRef.current(recover), () => getConnectivityState() === "online");
}
function bindCalendarMutationReconcile(database: CalendarDatabase | null, online: boolean) {
  if (!database || !online) return;
  void reconcileCalendarMutations(database);
  const timer = setInterval(() => void reconcileCalendarMutations(database), 30_000);
  return () => clearInterval(timer);
}
async function readCalendarSnapshot(database: CalendarDatabase | null, userId: string, connection: CalendarConnection, requestKey: string, hiddenKey: string, start: string, end: string, separateTarget: boolean, targetStart?: string, targetEnd?: string) {
  if (!database || database.identity.userId !== userId || database.identity.workspaceId !== connection.workspaceId || database.identity.bindingId !== connection.bindingId) return { requestKey, calendars: [], events: [], coverage: [], catalogLoaded: false, loaded: false, stale: true };
  return database.transaction("r", database.calendars, database.ranges, database.events, database.state, () => materializeCalendarSnapshot(database, requestKey, hiddenKey, start, end, separateTarget, targetStart, targetEnd));
}
async function materializeCalendarSnapshot(database: CalendarDatabase, requestKey: string, hiddenKey: string, start: string, end: string, separateTarget: boolean, targetStart?: string, targetEnd?: string) {
  const calendars = await database.calendars.toArray();
  const hidden = new Set<string>(JSON.parse(hiddenKey));
  const windows = calendarReadWindows(start, end, separateTarget, targetStart, targetEnd);
  const readable = calendars.filter(c => c.permissions.read && !c.permissions.freeBusyOnly && !hidden.has(JSON.stringify([c.bindingId, c.id])));
  const results = await Promise.all(readable.map(c => readCalendarWindow(database, c.id, windows)));
  const known = Boolean(await database.state.get("last_recovery"));
  return { requestKey, calendars, events: [...new Map(results.flatMap(r => r.ranges.flatMap(r => r.events)).map(e => [calendarEventKey(e), e])).values()], coverage: results.map(r => ({ calendarId: r.calendarId, ranges: r.coverage })), loaded: known && results.every(r => coversCalendarRange(r.coverage, { start, end })), catalogLoaded: known, stale: results.some(r => r.ranges.some(r => r.stale)) };
}
function calendarReadWindows(start: string, end: string, separateTarget: boolean, targetStart?: string, targetEnd?: string) {
  if (separateTarget && targetStart && targetEnd) return [{ start, end }, { start: targetStart, end: targetEnd }];
  return [{ start, end }];
}
async function readCalendarWindow(database: CalendarDatabase, calendarId: string, windows: { start: string; end: string }[]) {
  const ranges = await Promise.all(windows.map(w => readCalendarRangeCache(database, calendarId, w.start, w.end)));
  const stored = await database.ranges.where("calendarId").equals(calendarId).toArray();
  const coverage = stored.flatMap(r => windows.flatMap(w => overlapWindow(r, w)));
  return { ranges, calendarId, coverage };
}
function overlapWindow(range: { start: string; end: string }, window: { start: string; end: string }) {
  const a = Math.max(Date.parse(range.start), Date.parse(window.start)), b = Math.min(Date.parse(range.end), Date.parse(window.end));
  return a < b ? [{ start: new Date(a).toISOString(), end: new Date(b).toISOString() }] : [];
}
function recordForegroundLatency(input: Parameters<typeof refreshCalendarWindows>[0], began: number) {
  if (!input.targetStart) return;
  const elapsed = performance.now() - began;
  input.setReadLatency(old => old * 0.75 + elapsed * 0.25);
  emitCalendarMetric("foreground_latency", elapsed);
}
