import { getRequiredStringEnv, getStringEnv, type RuntimeEnv } from "./config";
import type { ImageStorage } from "./image-storage";
import type { DatabaseRealtimeMutationEvent } from "./services/database-delta";
import { AsyncLocalStorage } from "node:async_hooks";
import type { MeetingLifecycleAction, MeetingStatus } from "./features/meetings/meeting-types";
import type { MeetingAudioSource } from "./features/meetings/meeting-audio-ticket";

export type OutboundEmailMessage = {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
};

export type ServerRuntimeAdapter = {
  enqueueAiJob?(input: {
    env: RuntimeEnv;
    jobId: string;
  }): Promise<void>;
  scanAiFile?(input: {
    bytes: Uint8Array;
    contentType: string;
    filename: string;
    workspaceId: string;
  }): Promise<{ clean: boolean; scanner: string }>;
  applyPageContentUpdate?(input: {
    content: unknown;
    env: RuntimeEnv;
    pageId: string;
    userId: string;
  }): Promise<void>;
  applyMeetingSummaryUpdate?(input: {
    content: unknown;
    env: RuntimeEnv;
    meetingId: string;
    userId: string;
  }): Promise<void>;
  applyMeetingTranscriptUpdate?(input: {
    draftItemId?: string;
    env: RuntimeEnv;
    meetingId: string;
    segment: MeetingTranscriptYjsSegment;
    userId: string;
  }): Promise<void>;
  claimMeetingRecorderSession?(input: MeetingRecorderRuntimeInput & {
    recorderImage?: string | null;
    recorderName?: string;
    workspaceId: string;
  }): Promise<MeetingRecorderRuntimeState>;
  createImageStorage?(env: RuntimeEnv): ImageStorage | null;
  getCollaborationWebSocketUrl?(request: Request, env: RuntimeEnv): string;
  getDatabaseRealtimeWebSocketUrl?(
    request: Request,
    env: RuntimeEnv,
  ): string;
  getMeetingCollaborationWebSocketUrl?(
    request: Request,
    env: RuntimeEnv,
  ): string;
  getMeetingAudioWebSocketUrl?(request: Request, env: RuntimeEnv): string;
  getMeetingRecorderSession?(input: {
    env: RuntimeEnv;
    meetingId: string;
  }): Promise<MeetingRecorderRuntimeState | null>;
  getDatabaseUrl?(env: RuntimeEnv): string | null | undefined;
  getImageStorageMode?(env: RuntimeEnv): "s3" | "binding" | null | undefined;
  publishDatabaseMutation?(input: {
    env: RuntimeEnv;
    event: DatabaseRealtimeMutationEvent;
  }): Promise<void>;
  releaseMeetingRecorderSession?(
    input: MeetingRecorderRuntimeInput,
  ): Promise<void>;
  sendEmail?(input: {
    env: RuntimeEnv;
    message: OutboundEmailMessage;
  }): Promise<void>;
  transitionMeetingRecorderSession?(input: MeetingRecorderRuntimeInput & {
    action: Extract<
      MeetingLifecycleAction,
      "pause" | "resume" | "start" | "stop"
    >;
    durationMs?: number;
  }): Promise<MeetingRecorderRuntimeState>;
  selfHosted?: false;
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

export function getDatabaseRealtimeWebSocketUrl(
  request: Request,
  env: RuntimeEnv,
) {
  const explicitUrl = getStringEnv(env, "DATABASE_REALTIME_WEBSOCKET_URL");

  if (explicitUrl) return explicitUrl;

  const configured = getRuntimeAdapter().getDatabaseRealtimeWebSocketUrl?.(
    request,
    env,
  );

  if (configured) return configured;

  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/database-collaboration";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getCollaborationWebSocketUrl(
  request: Request,
  env: RuntimeEnv,
) {
  const explicitUrl = getStringEnv(env, "COLLABORATION_WEBSOCKET_URL");

  if (explicitUrl) {
    return explicitUrl;
  }

  const configured = getRuntimeAdapter().getCollaborationWebSocketUrl?.(
    request,
    env,
  );

  if (configured) {
    return configured;
  }

  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/collaboration";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getMeetingCollaborationWebSocketUrl(
  request: Request,
  env: RuntimeEnv,
) {
  const explicitUrl = getStringEnv(env, "MEETING_COLLABORATION_WEBSOCKET_URL");

  if (explicitUrl) return explicitUrl;

  const configured = getRuntimeAdapter().getMeetingCollaborationWebSocketUrl?.(
    request,
    env,
  );

  if (configured) return configured;

  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/meeting-collaboration";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getMeetingAudioWebSocketUrl(
  request: Request,
  env: RuntimeEnv,
) {
  const explicitUrl = getStringEnv(env, "MEETING_AUDIO_WEBSOCKET_URL");

  if (explicitUrl) return explicitUrl;

  const configured = getRuntimeAdapter().getMeetingAudioWebSocketUrl?.(
    request,
    env,
  );

  if (configured) return configured;

  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/meeting-audio";
  url.search = "";
  url.hash = "";
  return url.toString();
}

let runtimeAdapter: ServerRuntimeAdapter = {};
const runtimeAdapterStore = new AsyncLocalStorage<ServerRuntimeAdapter>();

export function setRuntimeAdapter(adapter: ServerRuntimeAdapter) {
  runtimeAdapter = adapter;
}

export function runWithRuntimeAdapter<T>(
  adapter: ServerRuntimeAdapter,
  callback: () => T,
) {
  return runtimeAdapterStore.run(adapter, callback);
}

export function getDatabaseUrl(env: RuntimeEnv) {
  const adapterUrl = getRuntimeAdapter().getDatabaseUrl?.(env);

  if (adapterUrl) {
    return adapterUrl;
  }

  return getRequiredStringEnv(env, "DATABASE_URL");
}

export function getRuntimeAdapter() {
  return runtimeAdapterStore.getStore() ?? runtimeAdapter;
}

export function isSelfHostedRuntime() {
  return getRuntimeAdapter().selfHosted !== false;
}

export function getConfiguredImageStorageMode(env: RuntimeEnv) {
  const configured = getStringEnv(env, "IMAGE_STORAGE_MODE");

  if (!configured) {
    return null;
  }

  if (configured === "s3" || configured === "binding") {
    return configured;
  }

  throw new Error("IMAGE_STORAGE_MODE must be either 's3' or 'binding'");
}
