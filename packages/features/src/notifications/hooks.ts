import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import { notificationKeys, notificationListQueryOptions } from "./queries"

export function useInProductNotifications(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(notificationListQueryOptions(apiFetch, workspaceId))
}

export function useMarkInProductNotificationRead(workspaceId: string | null | undefined) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (notificationId: string | "all") => apiFetch(
      `/workspaces/${encodeURIComponent(workspaceId!)}/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "POST" },
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.workspace(workspaceId ?? "") }),
  })
}
