import { queryOptions, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calendarApiBasePath, calendarKeys, type CalendarPreferences } from "@zilobase/features/calendar";
import { apiFetch, getApiErrorMessage } from "@/platform/network/api";
import { toast } from "sonner";

function calendarPreferencesQueryOptions(workspaceId: string) {
  return queryOptions({
    queryFn: ({ signal }) =>
      apiFetch<CalendarPreferences>(
        `${calendarApiBasePath(workspaceId)}/preferences`,
        { signal },
      ),
    queryKey: calendarKeys.preferences(workspaceId),
    staleTime: 60_000,
  });
}

export function useCalendarPreferences(workspaceId: string) {
  const client = useQueryClient(), options = calendarPreferencesQueryOptions(workspaceId), queryKey = options.queryKey, path = `${calendarApiBasePath(workspaceId)}/preferences`;
  const query = useQuery(options);
  const pending = useIsMutating({ mutationKey: queryKey }) > 0;
  const save = useMutation({ mutationKey: queryKey, mutationFn: (data: CalendarPreferences) => apiFetch<CalendarPreferences>(path, { method: "PUT", body: JSON.stringify(data) }), onSuccess: data => client.setQueryData(queryKey, data), onError: error => toast.error(getApiErrorMessage(error)) });
  return { query, save, pending };
}
