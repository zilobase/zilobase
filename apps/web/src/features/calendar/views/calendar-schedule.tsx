import { emitCalendarMetric } from "../metrics";
import { useCalendarBuffers } from "../preferences/calendar-buffer-preferences";
import { calendarRangeReady, calendarSnapshotMatches } from "../sync/range-coverage";
import {
  calendarDestinationRange,
  useCalendarNavigation,
  useCalendarVisibleDate,
} from "../workspace/calendar-navigation";
import { CalendarTimeZones } from "../preferences/calendar-time-zones";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";
import { createPortal } from "react-dom";
import { CalendarSearchResults } from "./calendar-search-results";
import { useCalendarDisplayPreferences } from "../preferences/calendar-travel";
import { CalendarMeetingPreview } from "./calendar-meeting-preview";
import { CalendarSourcePanel } from "./calendar-source-panel";
import { useCalendarWorkspace, type CalendarCommand } from "../workspace/calendar-workspace";
import { CalendarEventPanel } from "./calendar-event-panel";
import { CalendarStatus } from "./calendar-status";
import {
  CalendarSurface,
  type CalendarDisplayPreferences,
  type CalendarItem,
  type CalendarRange,
} from "@/shared/components/calendar";
import { runCalendarMutation } from "../events/calendar-mutations";
import { toast } from "sonner";
import { newCalendarEvent } from "../events/event-editor";
import { PALETTE, type ColorTokenId } from "@/shared/lib/color-tokens";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  calendarCapability,
  calendarDate,
  calendarDays,
  normalizeCalendarView,
  todayInZone,
  dayInstant,
  addCalendarDays,
  calendarEventKey,
  type CalendarConnection,
  type CalendarEvent,
  type CalendarPreferences,
  type CalendarRecord,
  type CalendarView,
} from "@zilobase/features/calendar";
import { useCalendarCache } from "../sync/use-calendar-cache";
import {
  calendarSelectionKey,
  calendarIsVisible,
  resolveDefaultCalendar,
} from "../connections/calendar-selection";
import { Button } from "@/shared/ui/button";
import { getApiErrorMessage } from "@/platform/network/api";
import type { CalendarDatabase } from "../storage/calendar-database";
type Snapshot = {
  readLatencyMs: number;
  requestKey?: string;
  coverage: { calendarId: string; ranges: CalendarRange[] }[];
  catalogLoaded: boolean;
  refresh: () => void;
  events: CalendarEvent[];
  calendars: CalendarRecord[];
  database: CalendarDatabase | null;
  error?: unknown;
  loaded: boolean;
  syncing: boolean;
  online: boolean;
  stale: boolean;
};
function AccountData({
  connection,
  userId,
  start,
  end,
  target,
  hiddenKeys,
  onData,
}: {
  connection: CalendarConnection;
  userId: string;
  start: string;
  end: string;
  target: CalendarRange | null;
  hiddenKeys: string[];
  onData: (binding: string, data: Snapshot) => void;
}) {
  const cache = useCalendarCache(connection, userId, start, end, { target, hiddenKeys });
  const refresh = useCallback(() => {
    void cache.refresh();
  }, [cache.refresh]);
  useEffect(() => {
    onData(connection.bindingId, {
      readLatencyMs: cache.readLatencyMs,
      requestKey: cache.requestKey,
      coverage: cache.coverage ?? [],
      catalogLoaded: cache.catalogLoaded ?? false,
      refresh,
      events: cache.events ?? [],
      calendars: cache.calendars ?? [],
      database: cache.database,
      error: cache.error,
      loaded: cache.loaded ?? false,
      syncing: cache.syncing,
      online: cache.online,
      stale: cache.stale ?? true,
    });
  }, [
    connection.bindingId,
    cache.readLatencyMs,
    cache.events,
    cache.calendars,
    cache.coverage,
    cache.catalogLoaded,
    cache.database,
    cache.error,
    cache.loaded,
    cache.syncing,
    cache.online,
    cache.stale,
    refresh,
    onData,
  ]);
  return null;
}
export function CalendarSchedule({
  connections,
  userId,
  preferences: savedPreferences,
  preferenceWorkspaceId,
}: {
  preferenceWorkspaceId?: string;
  connections: CalendarConnection[];
  userId: string;
  preferences: CalendarPreferences;
}) {
  const preferenceStore = useCalendarPreferences(
    preferenceWorkspaceId ?? connections[0]!.workspaceId,
  );
  const preferences = useCalendarDisplayPreferences(savedPreferences);
  const workspace = useCalendarWorkspace();
  const { query } = workspace;
  const search = useSearch({ from: "/app/calendar" }),
    navigate = useNavigate();
  const view = scheduleView(search.view, preferences.view);
  const routeDate = scheduleDate(search.date, workspace.travelZone ?? preferences.timeZone);
  const viewport = useCalendarVisibleDate(
    routeDate,
    search.date,
    workspace.travelZone ?? preferences.timeZone,
    workspace.visibleDate,
    workspace.setVisibleDate,
  );
  const { anchorDate, date } = viewport;
  const { value: buffers } = useCalendarBuffers();
  const allDays = useMemo(
    () =>
      calendarDays(
        anchorDate,
        view,
        preferences.weekStartsOn,
        search.days,
        preferences.showWeekends,
        search.align,
      ),
    [
      anchorDate,
      view,
      preferences.weekStartsOn,
      search.days,
      preferences.showWeekends,
      search.align,
    ],
  );
  const passiveDate = useRef<string | null>(null);
  const [viewportRange, setViewportRange] = useState<CalendarRange | null>(null);
  const onViewportRange = useCallback(
    (next: CalendarRange) =>
      setViewportRange((old) => (old?.start === next.start && old.end === next.end ? old : next)),
    [],
  );
  const [range, setRange] = useState<CalendarRange | null>(null);
  const cacheStart = cacheBound(range?.start, allDays[0]!, preferences.timeZone, 0);
  const cacheEnd = cacheBound(range?.end, allDays.at(-1)!, preferences.timeZone, 1);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({}),
    [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false);
  const onData = useCallback(
    (binding: string, data: Snapshot) =>
      setSnapshots((current) => ({ ...current, [binding]: data })),
    [],
  );
  const data = useMemo(
    () => matchingSnapshots(connections, snapshots, userId),
    [connections, snapshots, userId],
  );
  const prefetchLeadMs = Math.max(500, ...data.map((d) => d.readLatencyMs));
  const displayPreferences = useMemo(
    () => ({
      ...preferences,
      prefetchLeadMs,
      ...scheduleBuffers(view, buffers),
      visibleDayCount: search.days ?? 7,
      alignStart: search.align,
    }),
    [
      prefetchLeadMs,
      preferences,
      search.days,
      search.align,
      view,
      buffers.before,
      buffers.after,
      buffers.monthBefore,
      buffers.monthAfter,
    ],
  );
  const calendars = useMemo(() => data.flatMap((d) => d.calendars), [data]);
  const calendarsByKey = useMemo(
    () => new Map(calendars.map((c) => [calendarSelectionKey(c.bindingId, c.id), c])),
    [calendars],
  );
  const events = useMemo(
    () => data.flatMap((d) => d.events).filter((event) => visibleScheduleEvent(event, preferences)),
    [data, preferences],
  );
  const online = data.every((d) => d.online);
  const isRangeReady = useCallback(
    (range: CalendarRange) =>
      calendarRangeReady(connections, snapshots, userId, preferences, range),
    [connections, snapshots, preferences, userId],
  );
  const navigation = useCalendarNavigation({
    ready: isRangeReady,
    online,
    error: data.find((d) => d.error)?.error,
    initial: calendarDestinationRange(
      { date: anchorDate, view, days: search.days, align: search.align },
      preferences,
    ),
    retry: () => data.forEach((d) => d.refresh()),
  });
  useEffect(() => {
    requestScheduleRange(passiveDate, anchorDate, view, search, preferences, navigation.request);
  }, [anchorDate, view, search.days, search.align, preferences.timeZone, navigation.request]);
  useEffect(
    () =>
      workspace.registerNavigation((next, commit) =>
        navigation.request(calendarDestinationRange(next, preferences), () => {
          viewport.markExplicit(next.date);
          commit();
        }),
      ),
    [workspace.registerNavigation, navigation.request, preferences, viewport.markExplicit],
  );
  const hiddenKeys = useMemo(
    () => [...preferences.hiddenCalendarKeys, ...(preferences.removedCalendarKeys ?? [])],
    [preferences.hiddenCalendarKeys, preferences.removedCalendarKeys],
  );
  const setPeriod = useCallback(
    (next: string, nextView: CalendarView = view) => {
      const destination = { date: next, view: nextView, align: search.align, days: search.days };
      workspace.navigateCalendar(destination, () => {
        void navigate({ to: "/calendar", search: destination });
      });
    },
    [navigate, view, search.days, search.align, workspace.navigateCalendar],
  );
  useEffect(() => {
    selectSearchedEvent(search, events, editing, setSelected);
  }, [search.event, search.binding, search.calendar, snapshots]);
  const visible = events;
  const open = useCallback(
    (event: CalendarEvent) => {
      workspace.showSource(null);
      workspace.openPanel();
      setEditing(false);
      setCreating(false);
      setSelected(event);
      void navigate({
        to: "/calendar",
        search: {
          date: scheduleOpenDate(query, event, date, preferences.timeZone),
          view,
          align: search.align,
          days: search.days,
          binding: event.bindingId,
          calendar: event.calendarId,
          event: event.eventId,
        },
      });
    },
    [
      workspace.openPanel,
      navigate,
      date,
      view,
      search.days,
      search.align,
      query,
      preferences.timeZone,
    ],
  );
  const create = useCallback(
    (day = date, hour = 9, duration = 30, target?: CalendarRecord) => {
      startScheduleCreate({
        calendars,
        connections,
        preferences,
        day,
        hour,
        target,
        duration,
        workspace,
        setSelected,
        setEditing,
        setCreating,
      });
    },
    [date, calendars, preferences, connections, workspace.openPanel],
  );
  const canCreate = online && Boolean(resolveDefaultCalendar(calendars, preferences));
  useCalendarScheduleCommands({
    events,
    selected,
    create,
    open,
    canCreate,
    calendars,
    connections,
    workspace,
  });
  const changeGeometry = useCallback(
    async (event: CalendarEvent) => {
      await changeScheduleGeometry(
        event,
        snapshots,
        online,
        workspace.openPanel,
        setSelected,
        setCreating,
        setEditing,
      );
    },
    [snapshots, online, workspace.openPanel],
  );
  const color = (event: CalendarEvent) => eventSurfaceColor(event, preferences, calendarsByKey);
  const close = () => {
    setSelected(null);
    setEditing(false);
    setCreating(false);
    void navigate({
      to: "/calendar",
      search: { date, view, align: search.align, days: search.days },
    });
  };
  useEffect(() => workspace.register({ close, create: () => create() }));
  useEffect(() => {
    openPanelForSearch(search.event, workspace.openPanel);
  }, [search.event, workspace.openPanel]);
  const sourceConnection = connections.find(
    (connection) => connection.bindingId === workspace.source?.bindingId,
  );
  const sourceCalendar = findSourceCalendar(calendars, workspace.source);
  const selection = selectionData(selected, snapshots, connections);
  const { items, selectItem, changeItem, onGeometryError } = useCalendarScheduleItems(
    visible,
    color,
    online,
    calendarsByKey,
    preferences.calendarColors,
    open,
    changeGeometry,
  );
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {connections.map((c) => (
        <AccountData
          key={`${userId}:${c.workspaceId}:${c.bindingId}`}
          connection={c}
          userId={userId}
          start={cacheStart}
          end={cacheEnd}
          target={scheduleTarget(navigation.target, viewportRange)}
          hiddenKeys={hiddenKeys}
          onData={onData}
        />
      ))}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stroke-default px-4 py-3">
        <h1 className="min-w-0 truncate text-xl font-semibold">
          {new Intl.DateTimeFormat(undefined, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${date}T12:00:00Z`))}
        </h1>
        <Button className="shrink-0" disabled={!canCreate} onClick={() => create()}>
          Create event
        </Button>
      </div>
      <CalendarScheduleStatus
        navigation={navigation}
        viewportRange={viewportRange}
        isRangeReady={isRangeReady}
        data={data}
      />
      {scheduleMainView({
        query,
        connections,
        calendars,
        preferences,
        events,
        online,
        userId,
        open,
        emit: emitCalendarMetric,
        loadingMessage: scheduleLoadingMessage(online, data),
        isRangeReady,
        onViewportRange,
        navigation,
        passiveDate,
        markBookmark: viewport.markBookmark,
        view,
        search,
        navigate,
        savedPreferences,
        preferenceStore,
        workspace,
        date: anchorDate,
        headingDate: date,
        items,
        displayPreferences,
        setPeriod,
        setRange,
        selectItem,
        create,
        changeItem,
        onGeometryError,
      })}
      {scheduleDock({
        workspace,
        sourceConnection,
        sourceCalendar,
        calendars,
        userId,
        preferences,
        preferenceWorkspaceId,
        connections,
        open,
        create,
        snapshots,
        selection,
        online,
        editing,
        creating,
        selected,
        setSelected,
        setCreating,
        setEditing,
      })}
    </div>
  );
}

function useCalendarScheduleCommands(input: {
  events: CalendarEvent[];
  selected: CalendarEvent | null;
  create: (day?: string, hour?: number, duration?: number, target?: CalendarRecord) => void;
  open: (event: CalendarEvent) => void;
  canCreate: boolean;
  calendars: CalendarRecord[];
  connections: CalendarConnection[];
  workspace: ReturnType<typeof useCalendarWorkspace>;
}) {
  const commandState = useRef({
    events: input.events,
    selected: input.selected,
    create: input.create,
    open: input.open,
  });
  commandState.current = {
    events: input.events,
    selected: input.selected,
    create: input.create,
    open: input.open,
  };
  const featureCommands = useMemo<CalendarCommand[]>(
    () =>
      scheduleFeatureCommands(
        commandState,
        input.canCreate,
        input.calendars,
        input.connections,
        input.workspace.showSource,
      ),
    [
      input.canCreate,
      input.calendars,
      input.connections,
      input.workspace.showSource,
      input.events.length,
    ],
  );
  useEffect(() => {
    input.workspace.setFeatureCommands(featureCommands);
  }, [featureCommands, input.workspace.setFeatureCommands]);
}
function scheduleFeatureCommands(
  commandState: {
    current: {
      events: CalendarEvent[];
      selected: CalendarEvent | null;
      create: (day?: string, hour?: number, duration?: number, target?: CalendarRecord) => void;
      open: (event: CalendarEvent) => void;
    };
  },
  canCreate: boolean,
  calendars: CalendarRecord[],
  connections: CalendarConnection[],
  showSource: (value: { bindingId: string; calendarId: string } | null) => void,
): CalendarCommand[] {
  const canTraverse = commandState.current.events.length > 0;
  return [
    {
      id: "create",
      label: "Create event",
      shortcut: "C",
      disabled: !canCreate,
      run: () => commandState.current.create(),
    },
    {
      id: "next-event",
      label: "Next event",
      shortcut: "J",
      disabled: !canTraverse,
      run: () => traverseCalendarEvents(commandState.current, 1),
    },
    {
      id: "previous-event",
      label: "Previous event",
      shortcut: "K",
      disabled: !canTraverse,
      run: () => traverseCalendarEvents(commandState.current, -1),
    },
    ...calendars.map((calendar) => ({
      id: `source:${calendarSelectionKey(calendar.bindingId, calendar.id)}`,
      label: `Open calendar: ${calendar.name} · ${connections.find((connection) => connection.bindingId === calendar.bindingId)?.email ?? ""}`,
      run: () => showSource({ bindingId: calendar.bindingId, calendarId: calendar.id }),
    })),
  ];
}
function useCalendarScheduleItems(
  visible: CalendarEvent[],
  color: (event: CalendarEvent) => { backgroundClass: string; textClass: string },
  online: boolean,
  calendarsByKey: Map<string, CalendarRecord>,
  calendarColors: CalendarPreferences["calendarColors"],
  open: (event: CalendarEvent) => void,
  changeGeometry: (event: CalendarEvent) => Promise<void>,
) {
  const itemCache = useRef(new Map<string, CalendarItem>());
  const previousItems = useRef<CalendarItem[]>([]);
  const items = useMemo(() => {
    const cache = new Map<string, CalendarItem>();
    const next = visible.map((event) =>
      calendarSurfaceItem(event, color(event), online, calendarsByKey, itemCache.current, cache),
    );
    return retainCalendarItems(next, cache, itemCache, previousItems);
  }, [visible, calendarsByKey, calendarColors, online, color]);
  const originals = useMemo(
    () => new Map(visible.map((event) => [calendarEventKey(event), event])),
    [visible],
  );
  const selectItem = useCallback(
    (item: CalendarItem) => openScheduleItem(originals, item, open),
    [originals, open],
  );
  const changeItem = useCallback(
    (item: CalendarItem) => changeScheduleItem(originals, item, changeGeometry),
    [originals, changeGeometry],
  );
  const onGeometryError = useCallback((error: Error) => toast.error(error.message), []);
  return { items, selectItem, changeItem, onGeometryError };
}
async function changeScheduleGeometry(
  event: CalendarEvent,
  snapshots: Record<string, Snapshot>,
  online: boolean,
  openPanel: () => void,
  setSelected: (event: CalendarEvent) => void,
  setCreating: (value: boolean) => void,
  setEditing: (value: boolean) => void,
) {
  const snapshot = snapshots[event.bindingId];
  if (!online || !snapshot?.database) return;
  if (event.recurringEventId || event.attendees.length) {
    openPanel();
    setSelected(event);
    setCreating(false);
    setEditing(true);
    return;
  }
  try {
    await runCalendarMutation({
      database: snapshot.database,
      event,
      action: "update",
      write: {
        operationId: crypto.randomUUID(),
        etag: event.etag,
        sendUpdates: "all",
        event: { start: event.start, end: event.end },
      },
    });
  } catch (error) {
    toast.error(getApiErrorMessage(error));
  }
}
function retainCalendarItems(
  next: CalendarItem[],
  cache: Map<string, CalendarItem>,
  itemCache: { current: Map<string, CalendarItem> },
  previousItems: { current: CalendarItem[] },
) {
  itemCache.current = cache;
  if (
    next.length === previousItems.current.length &&
    next.every((item, index) => item === previousItems.current[index])
  )
    return previousItems.current;
  previousItems.current = next;
  return next;
}
function scheduleTarget(
  target: CalendarRange | null | undefined,
  viewportRange: CalendarRange | null,
) {
  return target ?? viewportRange;
}
function openScheduleItem(
  originals: Map<string, CalendarEvent>,
  item: CalendarItem,
  open: (event: CalendarEvent) => void,
) {
  const event = originals.get(item.id);
  if (event) open(event);
}
function changeScheduleItem(
  originals: Map<string, CalendarEvent>,
  item: CalendarItem,
  changeGeometry: (event: CalendarEvent) => Promise<void>,
) {
  const event = originals.get(item.id);
  if (event) void changeGeometry({ ...event, start: item.start, end: item.end });
}
function scheduleView(searchView: string | undefined, preferenceView: CalendarView) {
  return normalizeCalendarView(searchView ?? preferenceView);
}
function scheduleDate(searchDate: string | undefined, zone: string) {
  return searchDate ?? todayInZone(zone);
}
function cacheBound(explicit: string | undefined, day: string, zone: string, extraDays: number) {
  if (explicit) return explicit;
  return extraDays ? dayInstant(addCalendarDays(day, extraDays), zone) : dayInstant(day, zone);
}
function matchingSnapshots(
  connections: CalendarConnection[],
  snapshots: Record<string, Snapshot>,
  userId: string,
) {
  return connections.flatMap((c) =>
    calendarSnapshotMatches(snapshots[c.bindingId], userId, c) ? [snapshots[c.bindingId]!] : [],
  );
}
function openPanelForSearch(event: string | undefined, openPanel: () => void) {
  if (event) openPanel();
}
function findSourceCalendar(
  calendars: CalendarRecord[],
  source: { bindingId: string; calendarId: string } | null,
) {
  if (!source) return;
  return calendars.find(
    (calendar) => calendar.bindingId === source.bindingId && calendar.id === source.calendarId,
  );
}
function scheduleBuffers(
  view: CalendarView,
  buffers: { before: number; after: number; monthBefore: number; monthAfter: number },
) {
  if (view === "month")
    return { bufferBefore: buffers.monthBefore, bufferAfter: buffers.monthAfter };
  return { bufferBefore: buffers.before, bufferAfter: buffers.after };
}
function visibleScheduleEvent(event: CalendarEvent, preferences: CalendarPreferences) {
  if (!calendarIsVisible(preferences, event.bindingId, event.calendarId)) return false;
  if (preferences.showDeclined) return true;
  return !event.attendees.some((a) => a.self && a.responseStatus === "declined");
}
function requestScheduleRange(
  passiveDate: { current: string | null },
  date: string,
  view: CalendarView,
  search: { days?: number; align?: boolean },
  preferences: CalendarPreferences,
  request: (range: CalendarRange, commit: () => void) => void,
) {
  if (
    passiveDate.current ===
    JSON.stringify([date, view, search.days, search.align, preferences.timeZone])
  )
    return;
  request(
    calendarDestinationRange({ date, view, days: search.days, align: search.align }, preferences),
    () => {},
  );
}
function selectSearchedEvent(
  search: { event?: string; binding?: string; calendar?: string },
  events: CalendarEvent[],
  editing: boolean,
  setSelected: (event: CalendarEvent) => void,
) {
  if (!search.event || !search.binding || !search.calendar) return;
  const cached = events.find(
    (e) =>
      e.eventId === search.event &&
      e.bindingId === search.binding &&
      e.calendarId === search.calendar,
  );
  if (cached && !editing) setSelected(cached);
}
function scheduleOpenDate(query: string, event: CalendarEvent, date: string, zone: string) {
  return query.trim() ? calendarDate(event.start, zone) : date;
}
function startScheduleCreate(input: {
  calendars: CalendarRecord[];
  connections: CalendarConnection[];
  preferences: CalendarPreferences;
  day: string;
  hour: number;
  target?: CalendarRecord;
  duration: number;
  workspace: ReturnType<typeof useCalendarWorkspace>;
  setSelected: (event: CalendarEvent) => void;
  setEditing: (value: boolean) => void;
  setCreating: (value: boolean) => void;
}) {
  const seed = createScheduleEvent(
    input.calendars,
    input.connections,
    input.preferences,
    input.day,
    input.hour,
    input.target,
  );
  if (!seed) return;
  input.workspace.showSource(null);
  input.workspace.openPanel();
  input.setSelected({
    ...seed,
    end: {
      dateTime: new Date(Date.parse(seed.start.dateTime!) + input.duration * 60000).toISOString(),
      timeZone: input.preferences.timeZone,
    },
  });
  input.setEditing(true);
  input.setCreating(true);
}
function createScheduleEvent(
  calendars: CalendarRecord[],
  connections: CalendarConnection[],
  preferences: CalendarPreferences,
  day: string,
  hour: number,
  target?: CalendarRecord,
) {
  const calendar =
    target ??
    resolveDefaultCalendar(
      calendars.filter((c) => c.permissions.write),
      preferences,
    );
  if (!calendar) return;
  const connection = connections.find((c) => c.bindingId === calendar.bindingId)!;
  try {
    return newCalendarEvent({
      ...connection,
      calendarId: calendar.id,
      date: day,
      hour,
      timeZone: preferences.timeZone,
    });
  } catch (error) {
    toast.error(getApiErrorMessage(error));
  }
}
function CalendarScheduleStatus({
  navigation,
  viewportRange,
  isRangeReady,
  data,
}: {
  navigation: ReturnType<typeof useCalendarNavigation>;
  viewportRange: CalendarRange | null;
  isRangeReady: (range: CalendarRange) => boolean;
  data: Snapshot[];
}) {
  const loading = viewportLoadingLabel(navigation.pending, viewportRange, isRangeReady);
  return (
    <>
      {loading && (
        <div className="h-5 shrink-0 px-4 text-xs text-content-secondary" role="status">
          {loading}
        </div>
      )}
      <CalendarStatus data={data} online={data.every((d) => d.online)} error={undefined} />
      <ScheduleRetry navigation={navigation} data={data} />
      <SchedulePending navigation={navigation} />
    </>
  );
}
function viewportLoadingLabel(
  pending: boolean,
  viewportRange: CalendarRange | null,
  isRangeReady: (range: CalendarRange) => boolean,
) {
  if (pending || !viewportRange || isRangeReady(viewportRange)) return null;
  return "Loading enabled calendars…";
}
function ScheduleRetry({
  navigation,
  data,
}: {
  navigation: ReturnType<typeof useCalendarNavigation>;
  data: Snapshot[];
}) {
  if (navigation.pending || !data.some((d) => d.error)) return null;
  return (
    <Button variant="ghost" className="self-start" onClick={navigation.retry}>
      Retry loading dates
    </Button>
  );
}
function SchedulePending({ navigation }: { navigation: ReturnType<typeof useCalendarNavigation> }) {
  if (!navigation.pending) return null;
  return (
    <div
      className="flex shrink-0 items-center gap-2 px-4 py-1 text-xs text-content-secondary"
      role={navigation.error ? "alert" : "status"}
    >
      {navigation.error ? getApiErrorMessage(navigation.error) : "Opening date…"}
      {Boolean(navigation.error) && (
        <Button variant="ghost" onClick={navigation.retry}>
          Retry
        </Button>
      )}
      <Button variant="ghost" onClick={navigation.cancel}>
        Cancel
      </Button>
    </div>
  );
}
function traverseCalendarEvents(
  state: {
    events: CalendarEvent[];
    selected: CalendarEvent | null;
    open: (event: CalendarEvent) => void;
  },
  direction: -1 | 1,
) {
  const ordered = [...state.events].sort(
    (a, b) =>
      Date.parse(a.start.dateTime ?? a.start.date!) - Date.parse(b.start.dateTime ?? b.start.date!),
  );
  const current = ordered.findIndex(
    (event) => state.selected && calendarEventKey(event) === calendarEventKey(state.selected),
  );
  const start = direction > 0 ? 0 : ordered.length - 1;
  const target =
    ordered[current < 0 ? start : (current + direction + ordered.length) % ordered.length];
  if (target) state.open(target);
}
function scheduleLoadingMessage(online: boolean, data: Snapshot[]) {
  if (!online) return "These dates are not cached. Connect to load them.";
  if (data.some((d) => d.error)) return "Unable to load dates. Use Retry above.";
}
function scheduleMainView(props: {
  query: string;
  connections: CalendarConnection[];
  calendars: CalendarRecord[];
  preferences: CalendarPreferences;
  events: CalendarEvent[];
  online: boolean;
  userId: string;
  open: (event: CalendarEvent) => void;
  emit: typeof emitCalendarMetric;
  loadingMessage?: string;
  isRangeReady: (range: CalendarRange) => boolean;
  onViewportRange: (range: CalendarRange) => void;
  navigation: ReturnType<typeof useCalendarNavigation>;
  passiveDate: { current: string | null };
  markBookmark: (date: string) => void;
  view: CalendarView;
  search: { date?: string; days?: number; align?: boolean };
  navigate: ReturnType<typeof useNavigate>;
  savedPreferences: CalendarPreferences;
  preferenceStore: ReturnType<typeof useCalendarPreferences>;
  workspace: ReturnType<typeof useCalendarWorkspace>;
  date: string;
  headingDate: string;
  items: CalendarItem[];
  displayPreferences: CalendarDisplayPreferences;
  setPeriod: (next: string, view?: CalendarView) => void;
  setRange: (range: CalendarRange | null) => void;
  selectItem: (item: CalendarItem) => void;
  create: (day?: string, hour?: number, duration?: number, target?: CalendarRecord) => void;
  changeItem: (item: CalendarItem) => void;
  onGeometryError: (error: Error) => void;
}) {
  if (props.query.trim())
    return (
      <CalendarSearchResults
        query={props.query}
        connections={props.connections}
        calendars={props.calendars}
        preferences={props.preferences}
        cached={props.events}
        online={props.online}
        userId={props.userId}
        onSelect={props.open}
      />
    );
  return (
    <CalendarSurface
      onMetric={props.emit}
      loadingMessage={props.loadingMessage}
      isRangeReady={props.isRangeReady}
      onViewportRangeChange={props.onViewportRange}
      onRetryRange={props.navigation.retry}
      onPreviewDate={(next) => props.workspace.setVisibleDate(next)}
      onVisibleDateChange={(next) => bookmarkVisibleDate(props, next)}
      zoneControls={
        <CalendarTimeZones
          value={props.savedPreferences}
          onChange={(value) => props.preferenceStore.save.mutateAsync(value)}
          travelZone={props.workspace.travelZone}
          onRestore={() => props.workspace.setTravelZone(null)}
          date={new Date(`${props.headingDate}T12:00:00Z`)}
        />
      }
      items={props.items}
      date={props.date}
      view={props.view}
      preferences={props.displayPreferences}
      onNavigate={props.setPeriod}
      onRangeChange={props.setRange}
      onSelect={props.selectItem}
      onCreate={props.online ? props.create : undefined}
      onChange={props.changeItem}
      onError={props.onGeometryError}
    />
  );
}
function bookmarkVisibleDate(
  props: {
    view: CalendarView;
    search: { date?: string; days?: number; align?: boolean };
    preferences: CalendarPreferences;
    passiveDate: { current: string | null };
    markBookmark: (date: string) => void;
    navigate: ReturnType<typeof useNavigate>;
  },
  next: string,
) {
  props.markBookmark(next);
  props.passiveDate.current = JSON.stringify([
    next,
    props.view,
    props.search.days,
    props.search.align,
    props.preferences.timeZone,
  ]);
  if (props.search.date === next) return;
  void props.navigate({
    to: "/calendar",
    replace: true,
    search: (previous) => ({ ...previous, date: next }),
  });
}
function scheduleDock(props: {
  workspace: ReturnType<typeof useCalendarWorkspace>;
  sourceConnection?: CalendarConnection;
  sourceCalendar?: CalendarRecord;
  calendars: CalendarRecord[];
  userId: string;
  preferences: CalendarPreferences;
  preferenceWorkspaceId?: string;
  connections: CalendarConnection[];
  open: (event: CalendarEvent) => void;
  create: (day?: string, hour?: number, duration?: number, target?: CalendarRecord) => void;
  snapshots: Record<string, Snapshot>;
  selection: ReturnType<typeof selectionData>;
  online: boolean;
  editing: boolean;
  creating: boolean;
  selected: CalendarEvent | null;
  setSelected: (event: CalendarEvent | null) => void;
  setCreating: (value: boolean) => void;
  setEditing: (value: boolean) => void;
}) {
  if (!props.workspace.source)
    return (
      <CalendarEventPanel
        preview={
          props.workspace.panelOpen ? (
            <CalendarMeetingPreview
              connections={props.connections}
              userId={props.userId}
              preferences={props.preferences}
              onSelect={props.open}
            />
          ) : undefined
        }
        selected={props.selection.event}
        database={props.selection.database}
        calendars={props.selection.calendars}
        online={props.online}
        editing={props.editing}
        creating={props.creating}
        mapsProvider={props.preferences.mapsProvider}
        zone={props.preferences.timeZone}
        timeFormat={props.preferences.timeFormat}
        onClose={props.workspace.closePanel}
        onEdit={() => props.setEditing(true)}
        onDuplicate={() => {
          if (!props.selected) return;
          props.setSelected({
            ...props.selected,
            eventId: `local-${crypto.randomUUID()}`,
            etag: "",
            title: `${props.selected.title} (copy)`,
            attendees: [],
            recurringEventId: undefined,
            originalStartTime: undefined,
            recurrence: undefined,
          });
          props.setCreating(true);
          props.setEditing(true);
        }}
      />
    );
  if (props.sourceConnection && props.sourceCalendar)
    return (
      <CalendarSourcePanel
        key={`${props.sourceConnection.bindingId}:${props.sourceCalendar.id}`}
        connection={props.sourceConnection}
        calendar={props.sourceCalendar}
        allCalendars={props.calendars}
        userId={props.userId}
        preferences={props.preferences}
        preferenceWorkspaceId={props.preferenceWorkspaceId ?? props.connections[0]!.workspaceId}
        onSelect={props.open}
        onCreate={() =>
          props.create(todayInZone(props.preferences.timeZone), 9, 30, props.sourceCalendar)
        }
      />
    );
  return createPortal(
    <div data-calendar-event-panel className="grid gap-3 p-3">
      <p role="status">
        {!props.sourceConnection || props.snapshots[props.sourceConnection.bindingId]?.loaded
          ? "This calendar is no longer available."
          : "Loading calendar…"}
      </p>
      <Button variant="outline" onClick={props.workspace.closePanel}>
        Close
      </Button>
    </div>,
    props.workspace.panelElement,
  );
}
function sameInstant(left: CalendarItem["start"], right: CalendarItem["start"]) {
  return (
    left.date === right.date && left.dateTime === right.dateTime && left.timeZone === right.timeZone
  );
}
function sameCalendarItem(old: CalendarItem, candidate: CalendarItem) {
  return (
    old.title === candidate.title &&
    sameInstant(old.start, candidate.start) &&
    sameInstant(old.end, candidate.end) &&
    old.backgroundClass === candidate.backgroundClass &&
    old.textClass === candidate.textClass &&
    old.dashed === candidate.dashed &&
    old.editable === candidate.editable
  );
}
function calendarSurfaceItem(
  event: CalendarEvent,
  style: { backgroundClass: string; textClass: string },
  online: boolean,
  calendarsByKey: Map<string, CalendarRecord>,
  previous: Map<string, CalendarItem>,
  cache: Map<string, CalendarItem>,
) {
  const id = calendarEventKey(event);
  const candidate: CalendarItem = {
    id,
    title: event.title,
    start: event.start,
    end: event.end,
    backgroundClass: style.backgroundClass,
    textClass: style.textClass,
    dashed: event.attendees.some((a) => a.self && a.responseStatus === "needsAction"),
    editable:
      online &&
      calendarCapability(
        "update",
        calendarsByKey.get(calendarSelectionKey(event.bindingId, event.calendarId))?.permissions,
        event,
      ).allowed,
  };
  const old = previous.get(id);
  const item = old && sameCalendarItem(old, candidate) ? old : candidate;
  cache.set(id, item);
  return item;
}
function eventSurfaceColor(
  event: CalendarEvent,
  preferences: CalendarPreferences,
  calendarsByKey: Map<string, CalendarRecord>,
) {
  const override =
    preferences.calendarColors?.[calendarSelectionKey(event.bindingId, event.calendarId)];
  if (!event.colorId && override) return PALETTE[override];
  const providerColor =
    event.colorId ??
    calendarsByKey.get(calendarSelectionKey(event.bindingId, event.calendarId))?.colorId;
  const hues: ColorTokenId[] = [
    "blue",
    "purple",
    "green",
    "purple",
    "red",
    "yellow",
    "orange",
    "blue",
    "gray",
    "blue",
    "green",
    "red",
  ];
  return PALETTE[hues[Number(providerColor ?? 0) % hues.length] ?? "blue"];
}
function selectionMissing(
  event: CalendarEvent,
  snapshot: Snapshot | undefined,
  connections: CalendarConnection[],
) {
  if (!connections.some((c) => c.bindingId === event.bindingId)) return true;
  return Boolean(
    snapshot?.catalogLoaded &&
    !snapshot.calendars.some((calendar) => calendar.id === event.calendarId),
  );
}
function selectionData(
  event: CalendarEvent | null,
  snapshots: Record<string, Snapshot>,
  connections: CalendarConnection[],
) {
  if (!event || selectionMissing(event, snapshots[event.bindingId], connections))
    return { event: null, database: null, calendars: [] };
  const snapshot = snapshots[event.bindingId];
  return { event, database: snapshot?.database ?? null, calendars: snapshot?.calendars ?? [] };
}
