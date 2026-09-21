import type { MeetingListResponse, MeetingResponse } from "./contracts";
import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/api-fetcher"

export const meetingKeys = {
  all: ["meetings"] as const,
  details: () => [...meetingKeys.all, "detail"] as const,
  detail: (meetingId: string | null | undefined) =>
    [...meetingKeys.details(), meetingId ?? "none"] as const,
  lists: () => [...meetingKeys.all, "list"] as const,
  list: (workspaceId: string | null | undefined) =>
    [...meetingKeys.lists(), workspaceId ?? "none"] as const,
}

export function workspaceMeetingsQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) {
  return queryOptions({
    enabled: Boolean(workspaceId),
    queryKey: meetingKeys.list(workspaceId),
    queryFn: ({ signal }) => {
      if (!workspaceId) throw new Error("Workspace ID is required")
      return apiFetch<MeetingListResponse>(
        `/meetings?workspaceId=${encodeURIComponent(workspaceId)}`,
        { signal },
      )
    },
    staleTime: 15_000,
  })
}

export function meetingQueryOptions(
  apiFetch: ApiFetcher,
  meetingId: string | null | undefined,
) {
  return queryOptions({
    enabled: Boolean(meetingId),
    queryKey: meetingKeys.detail(meetingId),
    queryFn: ({ signal }) => {
      if (!meetingId) throw new Error("Meeting ID is required")
      return apiFetch<MeetingResponse>(`/meetings/${meetingId}`, { signal })
    },
    staleTime: 30_000,
    refetchInterval: false,
  })
}
