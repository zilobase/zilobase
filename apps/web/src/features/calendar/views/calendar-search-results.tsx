import { useEffect, useState } from "react";
import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { addCalendarDays, calendarApiBasePath, calendarEventKey, dayInstant, eventClock, eventInstant, type CalendarConnection, type CalendarEvent, type CalendarPreferences, type CalendarRecord } from "@zilobase/features/calendar";
import { createCalendarSelectionMatcher, calendarSelectionKey } from "../connections/calendar-selection";
import { apiFetch, getApiErrorMessage } from "@/platform/network/api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
type Cursor = { source: number; token?: string };

function calendarSearchQueryOptions(input: {
  debounced: string;
  enabled: boolean;
  from: string;
  sources: { calendar: CalendarRecord; connection: CalendarConnection }[];
  timeZone: string;
  until: string;
  userId: string;
}) {
  return infiniteQueryOptions({
    enabled: input.enabled,
    initialPageParam: { source: 0 } as Cursor,
    queryFn: ({ pageParam, signal }) =>
      fetchSearchPage(
        input.sources,
        pageParam,
        signal,
        input.debounced,
        input.from,
        input.until,
        input.timeZone,
      ),
    getNextPageParam: (page) => nextSearchPage(page, input.sources.length),
    queryKey: [
      "calendar",
      "search",
      input.userId,
      input.sources.map(({ connection, calendar }) => [
        connection.workspaceId,
        connection.bindingId,
        calendar.id,
      ]),
      input.debounced,
      input.from,
      input.until,
      input.timeZone,
    ] as const,
    staleTime: 30_000,
  });
}

export function CalendarSearchResults({ query, connections, calendars, preferences, cached, online, userId, onSelect }: { query: string; connections: CalendarConnection[]; calendars: CalendarRecord[]; preferences: CalendarPreferences; cached: CalendarEvent[]; online: boolean; userId: string; onSelect: (event: CalendarEvent) => void }) {
  const [debounced, setDebounced] = useState(""), [source, setSource] = useState("all"), [from, setFrom] = useState(""), [until, setUntil] = useState("");
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  const readable = calendars.filter(calendar => calendar.permissions.read && !calendar.permissions.freeBusyOnly);
  const matcher = createCalendarSelectionMatcher(preferences);
  const sources = searchSources(readable, connections, source, matcher);
  const invalidRange = Boolean(from && until && until < from);
  const results = useInfiniteQuery(
    calendarSearchQueryOptions({
      debounced,
      enabled: searchQueryEnabled(
        online,
        debounced,
        query,
        sources.length,
        invalidRange,
      ),
      from,
      sources,
      timeZone: preferences.timeZone,
      until,
      userId,
    }),
  );
  const loaded = searchLoadedEvents(online, query, debounced, results.data?.pages.flatMap(page => page.events) ?? [], cached);
  const events = uniqueSearchEvents(loaded.filter(event => matchesSearchEvent(event, sources, preferences, from, until)), preferences.timeZone);
  return <section aria-label="Calendar search results" className="min-h-0 flex-1 overflow-y-auto p-4">
    <SearchFilters source={source} setSource={setSource} readable={readable} connections={connections} from={from} setFrom={setFrom} until={until} setUntil={setUntil} />
    <SearchFeedback invalidRange={invalidRange} online={online} results={results} events={events} query={query} debounced={debounced} />
    <ul className="grid gap-2">{events.map(event => <li key={calendarEventKey(event)}><Button variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => onSelect(event)}><span>{event.title}<span className="block text-xs text-content-secondary">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: preferences.timeZone }).format(new Date(eventInstant(event.start, preferences.timeZone)))} · {eventClock(event.start, preferences.timeZone, preferences.timeFormat)}</span></span></Button></li>)}</ul>
    {online && results.hasNextPage && <Button className="mt-3" disabled={results.isFetching} onClick={() => void results.fetchNextPage()}>Load more results</Button>}
  </section>;
}
function SearchFilters({ source, setSource, readable, connections, from, setFrom, until, setUntil }: { source: string; setSource: (value: string) => void; readable: CalendarRecord[]; connections: CalendarConnection[]; from: string; setFrom: (value: string) => void; until: string; setUntil: (value: string) => void }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3"><Select value={source} onValueChange={setSource}><SelectTrigger aria-label="Search source" className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All visible calendars</SelectItem>{readable.map(calendar => <SelectItem key={calendarSelectionKey(calendar.bindingId, calendar.id)} value={calendarSelectionKey(calendar.bindingId, calendar.id)}>{calendar.name} · {connections.find(connection => connection.bindingId === calendar.bindingId)?.email}</SelectItem>)}</SelectContent></Select><label className="text-xs">From<Input aria-label="Search from date" type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="text-xs">Through<Input aria-label="Search through date" type="date" value={until} onChange={event => setUntil(event.target.value)} /></label></div>;
}
function SearchFeedback({ invalidRange, online, results, events, query, debounced }: { invalidRange: boolean; online: boolean; results: { error: unknown; isFetchNextPageError: boolean; fetchNextPage: () => Promise<unknown>; refetch: () => Promise<unknown>; isFetching: boolean }; events: CalendarEvent[]; query: string; debounced: string }) {
  return <>
    {invalidRange && <p role="alert">The end date must not precede the start date.</p>}
    {!online && <p role="status">Offline: searching cached events only.</p>}
    {results.error && <div role="alert">{getApiErrorMessage(results.error)}<Button variant="outline" onClick={() => void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch())}>Retry search</Button></div>}
    {results.isFetching || query.trim() !== debounced ? <p role="status">Searching…</p> : !events.length && !invalidRange && <p>No matching events.</p>}
  </>;
}
function searchQueryEnabled(online: boolean, debounced: string, query: string, sourceCount: number, invalidRange: boolean) {
  return online && Boolean(debounced) && query.trim() === debounced && sourceCount > 0 && !invalidRange;
}
async function fetchSearchPage(sources: { calendar: CalendarRecord; connection: CalendarConnection }[], pageParam: Cursor, signal: AbortSignal, debounced: string, from: string, until: string, zone: string) {
  const selected = sources[pageParam.source]!;
  const params = new URLSearchParams({ q: debounced, calendarId: selected.calendar.id, ...(from ? { start: dayInstant(from, zone) } : {}), ...(until ? { end: dayInstant(addCalendarDays(until, 1), zone) } : {}), ...(pageParam.token ? { pageToken: pageParam.token } : {}) });
  const page = await apiFetch<{ events: CalendarEvent[]; nextPageToken: string | null }>(`${calendarApiBasePath(selected.connection.workspaceId)}/connections/${encodeURIComponent(selected.connection.bindingId)}/search?${params}`, { signal });
  return { ...page, source: pageParam.source };
}
function nextSearchPage(page: { nextPageToken: string | null; source: number }, sourceCount: number): Cursor | undefined {
  if (page.nextPageToken) return { source: page.source, token: page.nextPageToken };
  if (page.source + 1 < sourceCount) return { source: page.source + 1 };
}
function searchSources(readable: CalendarRecord[], connections: CalendarConnection[], source: string, matcher: ReturnType<typeof createCalendarSelectionMatcher>) {
  return readable.flatMap(calendar => {
    const connection = connections.find(connection => connection.bindingId === calendar.bindingId);
    if (!connection || !sourceIncludesCalendar(source, matcher, calendar)) return [];
    return [{ calendar, connection }];
  }).sort((a, b) => calendarSelectionKey(a.calendar.bindingId, a.calendar.id).localeCompare(calendarSelectionKey(b.calendar.bindingId, b.calendar.id)));
}
function sourceIncludesCalendar(source: string, matcher: ReturnType<typeof createCalendarSelectionMatcher>, calendar: CalendarRecord) {
  if (source === "all") return matcher.isVisible(calendar.bindingId, calendar.id);
  return source === calendarSelectionKey(calendar.bindingId, calendar.id);
}
function searchLoadedEvents(online: boolean, query: string, debounced: string, pages: CalendarEvent[], cached: CalendarEvent[]) {
  if (!online) return cached.filter(event => `${event.title} ${event.description} ${event.location}`.toLowerCase().includes(query.toLowerCase()));
  if (query.trim() !== debounced) return [];
  return pages;
}
function matchesSearchEvent(event: CalendarEvent, sources: { calendar: CalendarRecord }[], preferences: CalendarPreferences, from: string, until: string) {
  if (event.status === "cancelled") return false;
  if (!sources.some(({ calendar }) => calendar.id === event.calendarId && calendar.bindingId === event.bindingId)) return false;
  if (!preferences.showDeclined && event.attendees.some(attendee => attendee.self && attendee.responseStatus === "declined")) return false;
  return matchesSearchRange(event, preferences.timeZone, from, until);
}
function matchesSearchRange(event: CalendarEvent, zone: string, from: string, until: string) {
  if (from && Date.parse(eventInstant(event.end, zone)) <= Date.parse(dayInstant(from, zone))) return false;
  if (until && Date.parse(eventInstant(event.start, zone)) >= Date.parse(dayInstant(addCalendarDays(until, 1), zone))) return false;
  return true;
}
function uniqueSearchEvents(events: CalendarEvent[], zone: string) {
  return [...new Map(events.map(event => [calendarEventKey(event), event])).values()].sort((a, b) => Date.parse(eventInstant(a.start, zone)) - Date.parse(eventInstant(b.start, zone)));
}
