import { useMemo } from "react"
import { queryOptions, useQuery } from "@tanstack/react-query"

import { apiFetch } from "@/platform/network/api"

function integrationAvailabilityQueryOptions(
  integration: "calendar" | "mail",
  workspaceId: string | null,
) {
  const enabled = Boolean(workspaceId)
  const resource = integration === "mail" ? "mail/connection" : "calendar/sources"

  return queryOptions({
    enabled,
    queryFn: ({ signal }) =>
      apiFetch<{ providerConfigured?: boolean }>(
        `/workspaces/${encodeURIComponent(workspaceId!)}/${resource}`,
        { signal },
      ),
    queryKey: ["integrations", integration, workspaceId] as const,
    retry: false,
    staleTime: 60_000,
  })
}

export function useIntegrationAvailability(workspaceId: string | null) {
  const enabled = Boolean(workspaceId)
  const mail = useQuery(integrationAvailabilityQueryOptions("mail", workspaceId))
  const calendar = useQuery(
    integrationAvailabilityQueryOptions("calendar", workspaceId),
  )

  const mailConfigured = mail.data?.providerConfigured === true
  const calendarConfigured = calendar.data?.providerConfigured === true
  const settled = (!enabled || mail.isFetched) && (!enabled || calendar.isFetched)
  return useMemo(
    () => ({ calendar: calendarConfigured, mail: mailConfigured, settled }),
    [calendarConfigured, mailConfigured, settled],
  )
}
