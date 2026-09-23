import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { apiFetch } from "@/platform/network/api"

export function useIntegrationAvailability(workspaceId: string | null) {
  const enabled = Boolean(workspaceId)
  const mail = useQuery({
    queryKey: ["integrations", "mail", workspaceId],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) => apiFetch<{ providerConfigured?: boolean }>(
      `/workspaces/${encodeURIComponent(workspaceId!)}/mail/connection`,
      { signal },
    ),
  })
  const calendar = useQuery({
    queryKey: ["integrations", "calendar", workspaceId],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) => apiFetch<{ providerConfigured?: boolean }>(
      `/workspaces/${encodeURIComponent(workspaceId!)}/calendar/sources`,
      { signal },
    ),
  })

  const mailConfigured = mail.data?.providerConfigured === true
  const calendarConfigured = calendar.data?.providerConfigured === true
  const settled = (!enabled || mail.isFetched) && (!enabled || calendar.isFetched)
  return useMemo(
    () => ({ calendar: calendarConfigured, mail: mailConfigured, settled }),
    [calendarConfigured, mailConfigured, settled],
  )
}
