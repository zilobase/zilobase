import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/context"
import { inProductNotificationListSchema } from "./contracts"

export const notificationKeys = {
  all: ["in-product-notifications"] as const,
  workspace: (workspaceId: string) => [...notificationKeys.all, workspaceId] as const,
}

export const notificationListQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) => queryOptions({
  enabled: Boolean(workspaceId),
  queryFn: async ({ signal }) => inProductNotificationListSchema.parse(
    await apiFetch(`/workspaces/${encodeURIComponent(workspaceId!)}/notifications`, { signal }),
  ),
  queryKey: notificationKeys.workspace(workspaceId ?? ""),
  refetchInterval: 30_000,
  staleTime: 10_000,
})
