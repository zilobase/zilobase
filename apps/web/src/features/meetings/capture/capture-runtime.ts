import type {
  MeetingCaptureController,
  MeetingCaptureStatus,
  MeetingAudioDevice,
  MeetingTranscriptDraft,
  RecoverableMeetingCapture,
} from "./types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
export type MeetingCaptureObserver = {
  setLevel: StateSetter<number>;
  setDevices: StateSetter<MeetingAudioDevice[]>;
  setStatus: StateSetter<MeetingCaptureStatus | null>;
  setLiveTranscripts: StateSetter<MeetingTranscriptDraft[] | undefined>;
  setRecovery: StateSetter<RecoverableMeetingCapture | null>;
};
export type MeetingCaptureRuntime = Omit<
  MeetingCaptureController,
  | "devices"
  | "level"
  | "liveTranscripts"
  | "recovery"
  | "status"
  | "deleteLocalFile"
  | "openLocalFile"
> & {
  observe: (meetingId: string, observer: MeetingCaptureObserver) => () => void;
  deleteLocalFile: (meetingId: string) => Promise<void>;
  openLocalFile: (meetingId: string) => Promise<void>;
};

let runtime: MeetingCaptureRuntime | undefined;

/** App composition installs one runtime before rendering meeting consumers. */
export function installMeetingCaptureRuntime(next: MeetingCaptureRuntime) {
  runtime = next;
}

export function getMeetingCaptureRuntime(): MeetingCaptureRuntime {
  if (!runtime) throw new Error("Meeting capture runtime has not been configured.");
  return runtime;
}
