import { getRequiredStringEnv, getStringEnv, type RuntimeEnv } from "./config";
import type { ImageStorage } from "./image-storage";
import type { DatabaseRealtimeMutationEvent } from "./services/database-delta";
import type { ToolSet } from "ai";
import { AsyncLocalStorage } from "node:async_hooks";

export type OutboundEmailMessage = {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
};

export type ServerRuntimeAdapter = {
  buildConnectorTools?(input: {
    env: RuntimeEnv;
    sources: readonly string[];
    userId: string;
    workspaceId: string;
  }): ToolSet;
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
  getDatabaseUrl?(env: RuntimeEnv): string | null | undefined;
  getImageStorageMode?(env: RuntimeEnv): "s3" | "binding" | null | undefined;
  publishDatabaseMutation?(input: {
    env: RuntimeEnv;
    event: DatabaseRealtimeMutationEvent;
  }): Promise<void>;
  sendEmail?(input: {
    env: RuntimeEnv;
    message: OutboundEmailMessage;
  }): Promise<void>;
  selfHosted?: false;
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
