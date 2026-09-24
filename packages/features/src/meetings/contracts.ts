export type MeetingStatus = "idle" | "recording" | "paused" | "processing" | "completed" | "failed";

export type MeetingRecord = {
  archiveLocalAudio: boolean;
  autoPlayConsent: boolean;
  calendarEventId: string | null;
  calendarSnapshot: unknown;
  consentMessage: string;
  createdAt: string;
  createdById: string | null;
  customInstructions: string | null;
  deletedAt: string | null;
  durationMs: number;
  id: string;
  instructionsPreset: string;
  language: string;
  notesPageId: string | null;
  pageId: string;
  recorderId: string | null;
  recorderLeaseId: string | null;
  recorderLeaseExpiresAt: string | null;
  recordingStartedAt: string | null;
  recordingStoppedAt: string | null;
  status: MeetingStatus;
  summaryGeneratedAt: string | null;
  summarySourceSegmentCount: number;
  title: string;
  transcriptRevision: number;
  updatedAt: string;
  workspaceId: string;
};

export type MeetingListItem = MeetingRecord & {
  emoji: string | null;
};

export type MeetingListResponse = { meetings: MeetingListItem[] };

export type MeetingResponse = { meeting: MeetingRecord };

export type MeetingRecorderClaim = MeetingResponse & {
  expiresAt: string;
  leaseExpiresAt: string;
  leaseId: string;
  token: string;
  websocketUrl: string;
};

export type MeetingSummary = {
  actionItems: Array<{ dueDate: string | null; owner: string | null; task: string }>;
  decisions: string[];
  highlights: string[];
  overview: string;
  title: string;
};

export type MeetingSummaryResponse = MeetingResponse & { summary: MeetingSummary };

export type CreateMeetingInput = {
  pageId: string;
  title?: string;
  workspaceId: string;
};

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
>;

export type MeetingLifecycleAction = "start" | "pause" | "resume" | "stop" | "complete" | "fail";
