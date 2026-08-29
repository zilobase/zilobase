export type MeetingAudioSource = "microphone" | "system";

export type MeetingStatus =
  | "idle"
  | "recording"
  | "paused"
  | "processing"
  | "completed"
  | "failed";

export type MeetingLifecycleAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "complete"
  | "fail";
