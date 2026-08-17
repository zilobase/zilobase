export const MEETING_MAX_DURATION_MS = 3 * 60 * 60 * 1000;

export const meetingStatuses = [
  "idle",
  "recording",
  "paused",
  "processing",
  "completed",
  "failed",
] as const;

export type MeetingStatus = (typeof meetingStatuses)[number];

export const meetingLifecycleActions = [
  "start",
  "pause",
  "resume",
  "stop",
  "complete",
  "fail",
] as const;

export type MeetingLifecycleAction = (typeof meetingLifecycleActions)[number];

export type MeetingCalendarSnapshot = {
  attendees: Array<{ email?: string; name?: string }>;
  endAt: string | null;
  startAt: string | null;
  title: string;
};

export type MeetingPatch = {
  archiveLocalAudio?: boolean;
  autoPlayConsent?: boolean;
  consentMessage?: string;
  customInstructions?: string | null;
  instructionsPreset?: string;
  language?: string;
  title?: string;
};
