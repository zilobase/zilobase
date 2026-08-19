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
  notesPageId: string | null
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

export type MeetingListItem = MeetingRecord & {
  emoji: string | null
}

export type MeetingListResponse = { meetings: MeetingListItem[] }

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

const LIVE_MEETING_STATUSES = new Set<MeetingStatus>([
  "recording",
  "paused",
  "processing",
])

export const meetingKeys = {
  all: ["meetings"] as const,
  details: () => [...meetingKeys.all, "detail"] as const,
  detail: (meetingId: string | null | undefined) =>
    [...meetingKeys.details(), meetingId ?? "none"] as const,
  lists: () => [...meetingKeys.all, "list"] as const,
  list: (workspaceId: string | null | undefined) =>
    [...meetingKeys.lists(), workspaceId ?? "none"] as const,
  transcript: (meetingId: string | null | undefined) =>
    [...meetingKeys.detail(meetingId), "transcript"] as const,
}

export function normalizeMeetingListResponse(
  payload: unknown,
): MeetingListResponse {
  const meetings = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (payload as { meetings?: unknown }).meetings
      : undefined

  return {
    meetings: Array.isArray(meetings)
      ? (meetings as MeetingListItem[])
      : [],
  }
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
      return apiFetch<unknown>(
        `/meetings?workspaceId=${encodeURIComponent(workspaceId)}`,
        { signal },
      )
    },
    select: normalizeMeetingListResponse,
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
    refetchInterval: (query) => {
      const status = query.state.data?.meeting.status
      return status && LIVE_MEETING_STATUSES.has(status) ? 5_000 : false
    },
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
