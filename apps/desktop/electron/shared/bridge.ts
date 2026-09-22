/** The only native surface visible to the packaged web application. */
export const DESKTOP_BRIDGE_VERSION = 1 as const;
export const DESKTOP_RENDERER_ORIGIN = "zilo-desktop://app" as const;

export type DesktopFailureCode =
  | "invalid_argument"
  | "forbidden_sender"
  | "storage_unavailable"
  | "operation_failed"
  | "unsupported_platform"
  | (string & {});

export type DesktopResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: DesktopFailureCode; message: string } };

/** ContextBridge clones rejected values, so failures are plain serializable objects. */
export type DesktopBridgeFailure = {
  name: "DesktopError";
  code: DesktopFailureCode;
  message: string;
};

export type DesktopServer = {
  instanceId: string;
  displayName: string;
  issuer: string;
  webOrigin: string;
  apiOrigin: string;
  protocolVersion: 1;
  serverVersion: string;
  minimumDesktopVersion: string;
};

export type DesktopWorkspaceSnapshot = { id: string; name: string };
export type DesktopProfile = {
  active: boolean;
  hasCredentials: boolean;
  lastActiveWorkspaceId: string | null;
  lastPath: string | null;
  lastUsedAt: string | null;
  server: DesktopServer;
  workspaces: DesktopWorkspaceSnapshot[];
};
export type DesktopProfileList = {
  activeInstanceId: string;
  profiles: DesktopProfile[];
};
export type DesktopCaptureStatus = {
  activeSources: Array<"microphone" | "system">;
  meetingId: string | null;
  phase: "idle" | "starting" | "recording" | "paused" | "stopped" | "error";
  elapsedMs: number;
  sampleRate: number;
  checkpointPath: string | null;
  error: string | null;
  warnings: string[];
};
export type DesktopCaptureConfig = {
  meetingId: string;
  audioWebsocketUrl?: string | null;
  audioTicket?: string | null;
  microphoneDeviceId?: string | null;
  systemDeviceId?: string | null;
  captureMicrophone?: boolean;
  captureSystemAudio?: boolean;
};
export type DesktopAudioDevice = {
  backend: string;
  captureMode: "microphone" | "native-loopback" | "virtual-input";
  id: string;
  name: string;
  kind: "microphone" | "system" | "output";
  isDefault: boolean;
  isSystemCaptureCandidate: boolean;
};
export type DesktopRecoverableCapture = {
  meetingId: string;
  startedAtEpochMs: number;
  elapsedMs: number;
  sampleRate: number;
  audioPath: string;
};
export type DesktopTranscriptDraft = {
  itemId: string;
  meetingId: string;
  source: "microphone" | "system";
  startMs: number;
  text: string;
  updatedAt: number;
};
export type DesktopDeepLink =
  | { type: "connect"; serverUrl: string }
  | { type: "open"; serverUrl: string; instanceId: string; path: string };

export interface ZilobaseDesktopBridge {
  readonly apiVersion: typeof DESKTOP_BRIDGE_VERSION;
  readonly platform: "darwin" | "win32" | "linux";
  readonly auth: {
    getToken(): Promise<string | null>;
    setToken(token: string | null): Promise<void>;
    getOwner(): Promise<string | null>;
    setOwner(owner: string | null): Promise<void>;
    startBrowser(): Promise<{ status: "success" }>;
    cancelBrowser(): Promise<void>;
    openMailUrl(authorizationUrl: string): Promise<void>;
  };
  readonly server: {
    initialize(): Promise<DesktopServer>;
    prepare(serverUrl: string): Promise<{ candidateId: string; server: DesktopServer }>;
    discard(candidateId: string): Promise<void>;
    commit(candidateId: string): Promise<{ changed: boolean; server: DesktopServer }>;
    list(): Promise<DesktopProfileList>;
    switch(input: { instanceId: string; apiOrigin: string; workspaceId?: string | null; path?: string | null }): Promise<DesktopServer>;
    updateSnapshot(input: { workspaces: DesktopWorkspaceSnapshot[]; lastActiveWorkspaceId?: string | null; lastPath?: string | null }): Promise<void>;
    remove(input: { instanceId: string; apiOrigin: string }): Promise<DesktopServer>;
    developmentTargets(): Promise<{
      cloudApiOrigin: string | null;
      customServers: Array<{ label: string; url: string }>;
    }>;
  };
  readonly window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    getState(): Promise<{ maximized: boolean }>;
    setOpacity(opacity: number): Promise<void>;
    onState(listener: (state: { maximized: boolean }) => void): () => void;
  };
  readonly deepLinks: {
    getPending(): Promise<DesktopDeepLink[]>;
    onOpen(listener: (links: DesktopDeepLink[]) => void): () => void;
  };
  readonly diagnostics: {
    rendererReady(elapsedMs: number): Promise<void>;
    record(event: string, fields: Record<string, unknown>, level: "info" | "warn" | "error"): Promise<void>;
    info(): Promise<{ logDirectory: string }>;
    openFolder(): Promise<void>;
    export(): Promise<string>;
  };
  readonly capture: {
    listDevices(): Promise<DesktopAudioDevice[]>;
    permissions(): Promise<{ microphone: string; systemAudio: string; systemAudioSupported: boolean; detail: string }>;
    start(config: DesktopCaptureConfig): Promise<DesktopCaptureStatus>;
    pause(): Promise<DesktopCaptureStatus>;
    resume(): Promise<DesktopCaptureStatus>;
    stop(): Promise<DesktopCaptureStatus>;
    state(): Promise<DesktopCaptureStatus>;
    refreshTransport(audioWebsocketUrl: string, audioTicket: string): Promise<void>;
    recoverable(): Promise<DesktopRecoverableCapture[]>;
    deleteLocal(meetingId: string): Promise<void>;
    openLocal(meetingId: string): Promise<void>;
    onState(listener: (status: DesktopCaptureStatus) => void): () => void;
    onLevel(listener: (level: { rms: number; peak: number }) => void): () => void;
    onWarning(listener: (warning: { message: string }) => void): () => void;
    onTranscript(listener: (draft: DesktopTranscriptDraft | null) => void): () => void;
  };
  readonly notifications: {
    requestPermission(): Promise<NotificationPermission>;
    show(input: { title: string; body: string }): Promise<void>;
  };
  readonly update: {
    check(): Promise<{ version: string; body: string | null } | null>;
    download(): Promise<void>;
    installRestart(): Promise<void>;
    onState(listener: (state: { phase: string; percent?: number }) => void): () => void;
  };
}
