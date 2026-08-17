import {
  MEETING_MAX_DURATION_MS,
  type MeetingLifecycleAction,
  type MeetingStatus,
} from "./meeting-types";

const transitions: Record<
  MeetingLifecycleAction,
  Partial<Record<MeetingStatus, MeetingStatus>>
> = {
  start: { idle: "recording", failed: "recording" },
  pause: { recording: "paused" },
  resume: { paused: "recording" },
  stop: { paused: "processing", recording: "processing" },
  complete: { processing: "completed" },
  fail: { processing: "failed", recording: "failed", paused: "failed" },
};

export function getNextMeetingStatus(
  current: MeetingStatus,
  action: MeetingLifecycleAction,
): MeetingStatus {
  const next = transitions[action][current];

  if (!next) {
    throw new Error(`Cannot ${action} a meeting in ${current} state`);
  }

  return next;
}

export function clampMeetingDuration(durationMs: number) {
  if (!Number.isFinite(durationMs)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.round(durationMs), MEETING_MAX_DURATION_MS));
}
