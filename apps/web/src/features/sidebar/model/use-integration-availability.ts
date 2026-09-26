import { useMemo } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/platform/network/api";

function integrationAvailabilityQueryOptions(workspaceId: string | null) {
  const enabled = Boolean(workspaceId);

  return queryOptions({
    enabled,
    queryFn: ({ signal }) =>
      apiFetch<{ providerConfigured?: boolean }>(
        `/workspaces/${encodeURIComponent(workspaceId!)}/calendar/sources`,
        { signal },
      ),
    queryKey: ["integrations", "calendar", workspaceId] as const,
    retry: false,
    staleTime: 60_000,
  });
}

export function useIntegrationAvailability(workspaceId: string | null) {
  const enabled = Boolean(workspaceId);
  const calendar = useQuery(integrationAvailabilityQueryOptions(workspaceId));

  const calendarConfigured = calendar.data?.providerConfigured === true;
  const settled = !enabled || calendar.isFetched;
  return useMemo(() => ({ calendar: calendarConfigured, settled }), [calendarConfigured, settled]);
}
