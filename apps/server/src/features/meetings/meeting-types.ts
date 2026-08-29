import type {
  MeetingLifecycleAction,
  MeetingStatus,
} from "./meeting-contracts";

export const MEETING_MAX_DURATION_MS = 3 * 60 * 60 * 1000;

const meetingStatuses = [
  "idle",
  "recording",
  "paused",
  "processing",
  "completed",
  "failed",
] as const satisfies readonly MeetingStatus[];

export type { MeetingLifecycleAction, MeetingStatus } from "./meeting-contracts";

export const meetingLifecycleActions = [
  "start",
  "pause",
  "resume",
  "stop",
  "complete",
  "fail",
] as const satisfies readonly MeetingLifecycleAction[];

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
