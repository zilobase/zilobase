import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import {
  meetingKeys,
  meetingQueryOptions,
  workspaceMeetingsQueryOptions,
  type CreateMeetingInput,
  type MeetingLifecycleAction,
  type MeetingPatch,
  type MeetingResponse,
  type MeetingRecorderClaim,
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
    onSuccess: (payload, patch) => {
      queryClient.setQueryData(meetingKeys.detail(meetingId), payload)
      void queryClient.invalidateQueries({ queryKey: meetingKeys.lists() })
      if (patch.title !== undefined && payload.meeting.notesPageId) {
        void queryClient.invalidateQueries({
          queryKey: pageQueryKey(payload.meeting.notesPageId),
        })
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) })
    },
  })
}

export function useMeetingLifecycle(meetingId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: ({ action, durationMs, leaseId }: {
      action: MeetingLifecycleAction
      durationMs?: number
      leaseId?: string
    }) =>
      apiFetch<MeetingResponse>(`/meetings/${meetingId}/${action}`, {
        body: JSON.stringify({
          ...(durationMs === undefined ? {} : { durationMs }),
          ...(leaseId ? { leaseId } : {}),
        }),
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
  return { claim, release }
}

export function useGenerateMeetingSummary(meetingId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: async () => {
      const accepted = await apiFetch<{
        job: { error: string | null; id: string; progress: number; status: string }
      }>(`/meetings/${meetingId}/summary`, {
        body: "{}",
        method: "POST",
      })
      await waitForAiJob(apiFetch, accepted.job.id)
      return apiFetch<MeetingResponse>(`/meetings/${meetingId}`)
    },
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

async function waitForAiJob(apiFetch: ReturnType<typeof useZilobaseFeatures>["apiFetch"], jobId: string) {
  const deadline = Date.now() + 10 * 60 * 1_000
  while (Date.now() < deadline) {
    const { job } = await apiFetch<{
      job: { error: string | null; status: string }
    }>(`/ai/jobs/${encodeURIComponent(jobId)}`)
    if (job.status === "succeeded") return
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error || "Meeting summary failed.")
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error("Meeting summary is still processing. Try again shortly.")
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
