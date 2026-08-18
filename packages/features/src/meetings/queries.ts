import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

export type MeetingStatus =
  | "idle"
  | "recording"
  | "paused"
  | "processing"
  | "completed"
  | "failed"

export type MeetingRecord = {
  archiveLocalAudio: boolean
  autoPlayConsent: boolean
  calendarEventId: string | null
  calendarSnapshot: unknown
  consentMessage: string
  createdAt: string
  createdById: string | null
  customInstructions: string | null
  deletedAt: string | null
  durationMs: number
  id: string
  instructionsPreset: string
  language: string
  pageId: string
  recorderId: string | null
  recorderLeaseId: string | null
  recorderLeaseExpiresAt: string | null
  recordingStartedAt: string | null
  recordingStoppedAt: string | null
  status: MeetingStatus
  summaryGeneratedAt: string | null
  summarySourceSegmentCount: number
  title: string
  transcriptRevision: number
  updatedAt: string
  workspaceId: string
}

export type MeetingResponse = { meeting: MeetingRecord }

export type MeetingRecorderClaim = MeetingResponse & {
  expiresAt: string
  leaseExpiresAt: string
  leaseId: string
  token: string
  websocketUrl: string
}

export type MeetingSummary = {
  actionItems: Array<{ dueDate: string | null; owner: string | null; task: string }>
  decisions: string[]
  highlights: string[]
  overview: string
  title: string
}

export type MeetingSummaryResponse = MeetingResponse & { summary: MeetingSummary }

export const meetingKeys = {
  all: ["meetings"] as const,
  details: () => [...meetingKeys.all, "detail"] as const,
  detail: (meetingId: string | null | undefined) =>
    [...meetingKeys.details(), meetingId ?? "none"] as const,
  transcript: (meetingId: string | null | undefined) =>
    [...meetingKeys.detail(meetingId), "transcript"] as const,
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
    refetchInterval: 5_000,
  })
}

export type MeetingTranscriptSegment = {
  createdAt: string
  endMs: number
  id: string
  meetingId: string
  providerItemId: string | null
  revision: number
  sequence: number
  source: string
  speaker: string | null
  startMs: number
  text: string
}

export type MeetingTranscriptResponse = {
  segments: MeetingTranscriptSegment[]
}

export function meetingTranscriptQueryOptions(
  apiFetch: ApiFetcher,
  meetingId: string | null | undefined,
  live = false,
) {
  return queryOptions({
    enabled: Boolean(meetingId),
    queryKey: meetingKeys.transcript(meetingId),
    queryFn: ({ signal }) => {
      if (!meetingId) throw new Error("Meeting ID is required")
      return apiFetch<MeetingTranscriptResponse>(
        `/meetings/${meetingId}/transcript`,
        { signal },
      )
    },
    refetchInterval: live ? 2_000 : false,
    staleTime: live ? 1_000 : 30_000,
  })
}

export type CreateMeetingInput = {
  pageId: string
  title?: string
  workspaceId: string
}

export type MeetingPatch = Partial<
  Pick<
    MeetingRecord,
    | "archiveLocalAudio"
    | "autoPlayConsent"
    | "consentMessage"
    | "customInstructions"
    | "instructionsPreset"
    | "language"
    | "title"
  >
>

export type MeetingLifecycleAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "complete"
  | "fail"
