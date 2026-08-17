import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../context"
import {
  meetingKeys,
  meetingQueryOptions,
  type CreateMeetingInput,
  type MeetingLifecycleAction,
  type MeetingPatch,
  type MeetingResponse,
  type MeetingRecorderClaim,
} from "./queries"

export function useMeeting(meetingId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(meetingQueryOptions(apiFetch, meetingId))
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
    },
  })
  const heartbeat = useMutation({
    mutationFn: (leaseId: string) =>
      apiFetch<MeetingResponse & { leaseExpiresAt: string }>(
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
    },
  })
  return { claim, heartbeat, release }
}
