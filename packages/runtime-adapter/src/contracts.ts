// Canonical runtime contracts for `@zilobase/runtime-adapter`.
// Moved from `apps/server/src/infrastructure/runtime/contracts.ts`.
// This file intentionally uses `import type` only and defines its own
// minimal structural types so the workerd bundle never pulls
// `ioredis` / `ws` / `pg` / `aws-sdk` via a static server import.

export type RuntimeEnv = Record<string, unknown>;

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

export type BackgroundTaskKind =
  | "automation.event_window"
  | "automation.run"
  | "agent.run"
  | "ai.job"
  | "mail.index"
  | "calendar.sync"
  | "mail.database_sync"
  | "realtime.database"
  | "realtime.navigation"
  | "notification.publish";

export type BackgroundTaskV1 = {
  availableAt: string;
  cellId: string;
  kind: BackgroundTaskKind;
  resourceId: string;
  traceparent?: string;
  tracestate?: string;
  version: 1;
};

export type ImageStorageMode = "s3" | "binding";

export type ImageStorage = {
  mode: ImageStorageMode;
  createUploadUrl(options: {
    byteSize: number;
    contentType: string;
    expiresInSeconds: number;
    objectKey: string;
  }): Promise<{
    expiresAt: string;
    headers: Record<string, string>;
    method: "PUT";
    storageMode: ImageStorageMode;
    url: string;
  }>;
  createReadUrl(options: {
    expiresInSeconds: number;
    filename?: string;
    objectKey: string;
  }): Promise<string>;
  delete(objectKey: string): Promise<void>;
  get(objectKey: string): Promise<{
    body: ReadableStream;
    byteSize?: number;
    contentType?: string;
    etag?: string;
    uploadedAt?: Date;
  } | null>;
  head(objectKey: string): Promise<{
    byteSize?: number;
    contentType?: string;
    etag?: string;
    uploadedAt?: Date;
  } | null>;
  putObject(options: {
    body: ReadableStream | ArrayBuffer | Blob;
    contentType: string;
    objectKey: string;
  }): Promise<{
    byteSize?: number;
    contentType?: string;
    etag?: string;
    uploadedAt?: Date;
  }>;
};

export type OutboundEmailMessage = {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
};

export type MailNotificationEvent = {
  bindingId: string;
  connectionId: string;
  revision: number;
  userId: string;
  workspaceId: string;
};

export type MeetingRecorderRuntimeInput = {
  env: RuntimeEnv;
  leaseId?: string;
  meetingId: string;
  userId: string;
};

export type MeetingRecorderRuntimeState = {
  durationMs: number;
  expiresAt: number;
  leaseId: string;
  recorderId: string;
  recorderImage: string | null;
  recorderName: string;
  startedAt: number;
  status: Extract<MeetingStatus, "paused" | "recording"> | "claimed" | "finishing";
};

export type MeetingTranscriptYjsSegment = {
  id: string;
  source: MeetingAudioSource;
  startMs: number;
  text: string;
};

export type CalendarNotificationEvent = { bindingId: string; accountId: string; userId: string; workspaceId: string; calendarId: string; revision: number; generation: number };

export type WorkerEnvBindings = Record<string, unknown>;
