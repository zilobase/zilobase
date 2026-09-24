import { useSession } from "@zilobase/features/auth/react";
import { calendarDatabaseName, destroyCalendarDatabase } from "../storage/calendar-database";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  calendarApiBasePath,
  calendarKeys,
  type CalendarConnection,
} from "@zilobase/features/calendar";
import { apiFetch, toApiUrl, getApiErrorMessage } from "@/platform/network/api";
import { isDesktopApp } from "@/platform/environment";
import { desktopBridge } from "@/platform/desktop/native";
import { toast } from "sonner";

export const calendarSourcesQueryKey = ["calendar", "sources"] as const;

function calendarAccountsQueryOptions(userId: string, workspaceId: string) {
  return queryOptions({
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      apiFetch<{
        connections: CalendarConnection[];
        providerConfigured: boolean;
      }>(`${calendarApiBasePath(workspaceId)}/sources`, { signal }),
    queryKey: calendarKeys.sources(userId, workspaceId),
    refetchInterval: 30_000,
    retry: false,
    staleTime: 30_000,
  });
}

export function useCalendarAccounts(workspaceId: string) {
  const { data: session } = useSession();
  const client = useQueryClient(),
    base = calendarApiBasePath(workspaceId);
  const accounts = useQuery(calendarAccountsQueryOptions(session?.user?.id ?? "", workspaceId));
  const connect = useMutation({
    mutationFn: async () => {
      const { authorizationUrl } = await apiFetch<{ authorizationUrl: string }>(
        `${base}/connections/google/start`,
        { method: "POST", body: JSON.stringify({ client: isDesktopApp() ? "desktop" : "web" }) },
      );
      if (isDesktopApp()) await desktopBridge().auth.openMailUrl(authorizationUrl);
      else window.location.assign(authorizationUrl);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const disconnect = useMutation({
    mutationFn: async (bindingId: string) => {
      const connection = accounts.data?.connections.find(
        (source) => source.bindingId === bindingId,
      );
      if (!connection) throw new Error("Calendar source is no longer available.");
      await apiFetch(
        `${calendarApiBasePath(connection.workspaceId)}/connections/${encodeURIComponent(bindingId)}`,
        { method: "DELETE" },
      );
      return connection;
    },
    onSuccess: async (connection, bindingId) => {
      if (session?.user?.id)
        await destroyCalendarDatabase(
          calendarDatabaseName({
            apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin,
            userId: session.user.id,
            workspaceId: connection.workspaceId,
            bindingId,
          }),
        );
      await client.invalidateQueries({ queryKey: calendarSourcesQueryKey });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  return { accounts, connect, disconnect };
}
