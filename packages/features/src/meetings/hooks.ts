import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../context"
import {
  meetingKeys,
  meetingQueryOptions,
  meetingTranscriptQueryOptions,
  workspaceMeetingsQueryOptions,
  type CreateMeetingInput,
  type MeetingLifecycleAction,
  type MeetingPatch,
  type MeetingResponse,
  type MeetingRecorderClaim,
  type MeetingSummaryResponse,
} from "./queries"
import {
  pageQueryKey,
  pagesNavRootQueryKey,
} from "../pages/queries"

export function useMeeting(meetingId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(meetingQueryOptions(apiFetch, meetingId))
}

export function useWorkspaceMeetings(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(workspaceMeetingsQueryOptions(apiFetch, workspaceId))
}

export function useMeetingTranscript(
  meetingId: string | null | undefined,
  live = false,
) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(meetingTranscriptQueryOptions(apiFetch, meetingId, live))
}

export function useCreateMeeting() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: CreateMeetingInput) =>
      apiFetch<MeetingResponse>("/meetings", {
        body: JSON.stringify(input),
        method: "POST",
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(
        meetingKeys.detail(payload.meeting.id),
        payload,
      )
      void queryClient.invalidateQueries({ queryKey: meetingKeys.lists() })
    },
  })
}

export function useDeleteMeeting() {
  const { apiFetch, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (meetingId: string) =>
      apiFetch<MeetingResponse>(`/meetings/${meetingId}`, {
        method: "DELETE",
      }),
    onSuccess: async ({ meeting }) => {
      queryClient.removeQueries({ queryKey: meetingKeys.detail(meeting.id) })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meetingKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: pagesNavRootQueryKey(meeting.workspaceId),
        }),
        meeting.notesPageId
          ? queryClient.invalidateQueries({
              queryKey: pageQueryKey(meeting.notesPageId),
            })
          : Promise.resolve(),
      ])
    },
  })
}

export function useUpdateMeeting(meetingId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (patch: MeetingPatch) =>
      apiFetch<MeetingResponse>(`/meetings/${meetingId}`, {
        body: JSON.stringify(patch),
        method: "PATCH",
      }),
    onMutate: async (patch) => {
      const queryKey = meetingKeys.detail(meetingId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<MeetingResponse>(queryKey)
      if (previous) {
        queryClient.setQueryData<MeetingResponse>(queryKey, {
          meeting: { ...previous.meeting, ...patch },
        })
      }
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(meetingKeys.detail(meetingId), context.previous)
      }
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(meetingKeys.detail(meetingId), payload)
      void queryClient.invalidateQueries({ queryKey: meetingKeys.lists() })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) })
    },
  })
}

export function useMeetingLifecycle(meetingId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: ({ action, durationMs }: {
      action: MeetingLifecycleAction
      durationMs?: number
    }) =>
      apiFetch<MeetingResponse>(`/meetings/${meetingId}/${action}`, {
        body: JSON.stringify(durationMs === undefined ? {} : { durationMs }),
        method: "POST",
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(meetingKeys.detail(meetingId), payload)
      void queryClient.invalidateQueries({ queryKey: meetingKeys.lists() })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) })
    },
  })
}

export function useMeetingRecorder(meetingId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  const claim = useMutation({
    mutationFn: () =>
      apiFetch<MeetingRecorderClaim>(`/meetings/${meetingId}/recorder/claim`, {
        body: "{}",
        method: "POST",
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(meetingKeys.detail(meetingId), {
        meeting: payload.meeting,
      })
      void queryClient.invalidateQueries({ queryKey: meetingKeys.lists() })
    },
  })
  const heartbeat = useMutation({
    mutationFn: (leaseId: string) =>
      apiFetch<MeetingRecorderClaim>(
        `/meetings/${meetingId}/recorder/heartbeat`,
        { body: JSON.stringify({ leaseId }), method: "POST" },
      ),
  })
  const release = useMutation({
    mutationFn: (leaseId: string) =>
      apiFetch<MeetingResponse>(`/meetings/${meetingId}/recorder/release`, {
        body: JSON.stringify({ leaseId }),
        method: "POST",
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(meetingKeys.detail(meetingId), payload)
      void queryClient.invalidateQueries({ queryKey: meetingKeys.lists() })
    },
  })
  return { claim, heartbeat, release }
}

export function useGenerateMeetingSummary(meetingId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: () =>
      apiFetch<MeetingSummaryResponse>(`/meetings/${meetingId}/summary`, {
        body: "{}",
        method: "POST",
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData<MeetingResponse>(meetingKeys.detail(meetingId), {
        meeting: payload.meeting,
      })
      void queryClient.invalidateQueries({ queryKey: meetingKeys.lists() })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) })
    },
  })
}

export function useRecordMeetingConsent(meetingId: string) {
  const { apiFetch } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (mode: "confirmed" | "played") =>
      apiFetch<{ consent: { id: string } }>(`/meetings/${meetingId}/consent`, {
        body: JSON.stringify({
          metadata: { source: "meeting-block" },
          mode,
        }),
        method: "POST",
      }),
  })
}
