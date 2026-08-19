export type MeetingCapturePhase =
  | "idle"
  | "starting"
  | "recording"
  | "paused"
  | "stopped"
  | "error"

export type MeetingCaptureSource = "microphone" | "system"

export type MeetingCaptureStatus = {
  activeSources?: MeetingCaptureSource[]
  checkpointPath: string | null
  elapsedMs: number
  error: string | null
  meetingId: string | null
  phase: MeetingCapturePhase
  sampleRate: number
  warnings?: string[]
}

export type RecoverableMeetingCapture = {
  audioPath: string
  elapsedMs: number
  meetingId: string
  sampleRate: number
  startedAtEpochMs: number
}

export type MeetingAudioDevice = {
  backend?: string
  captureMode?: "native-loopback" | "virtual-input" | "microphone"
  id: string
  isDefault: boolean
  isSystemCaptureCandidate: boolean
  kind: "microphone" | "system" | "output"
  name: string
}

export type MeetingCaptureStartConfig = {
  audioTicket: string
  audioWebsocketUrl: string
  captureMicrophone: boolean
  captureSystemAudio: boolean
  meetingId: string
  microphoneDeviceId?: string
  systemDeviceId?: string
}

export type MeetingCapturePrepareConfig = Pick<
  MeetingCaptureStartConfig,
  | "captureMicrophone"
  | "captureSystemAudio"
  | "meetingId"
  | "microphoneDeviceId"
  | "systemDeviceId"
>

export type MeetingCaptureController = {
  cancelPreparation: () => Promise<void>
  deleteLocalFile: () => Promise<void>
  devices: MeetingAudioDevice[]
  level: number
  openLocalFile: () => Promise<void>
  pause: () => Promise<MeetingCaptureStatus>
  prepare: (config: MeetingCapturePrepareConfig) => Promise<void>
  recovery: RecoverableMeetingCapture | null
  refreshTransport: (audioWebsocketUrl: string, audioTicket: string) => Promise<void>
  resume: () => Promise<MeetingCaptureStatus>
  start: (config: MeetingCaptureStartConfig) => Promise<MeetingCaptureStatus>
  status: MeetingCaptureStatus | null
  stop: () => Promise<MeetingCaptureStatus>
}
