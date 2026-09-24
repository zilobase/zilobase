import { queryOptions, useQueries } from "@tanstack/react-query";
import { calendarApiBasePath, calendarKeys, type CalendarConnection, type CalendarRecord } from "@zilobase/features/calendar";
import { apiFetch } from "@/platform/network/api";

function calendarCatalogQueryOptions(connection: CalendarConnection) {
  return queryOptions({
    queryFn: ({ signal }) =>
      apiFetch<{ calendars: CalendarRecord[] }>(
        `${calendarApiBasePath(connection.workspaceId)}/connections/${encodeURIComponent(connection.bindingId)}/calendars`,
        { signal },
      ),
    queryKey: calendarKeys.calendars(connection),
    retry: false,
    staleTime: 60_000,
  });
}

export function useCalendarCatalog(connections: CalendarConnection[]) {
  const queries = useQueries({
    queries: connections.map(calendarCatalogQueryOptions),
  });
  return { queries, calendars: queries.flatMap(query => query.data?.calendars ?? []), ready: queries.every(query => query.isSuccess) };
}
