import { getRuntimeAdapter } from "./context";
import type {
  CalendarNotificationEvent,
  MailNotificationEvent,
  RuntimeEnv,
} from "./contracts";

export { getRuntimeAdapter, runWithRuntimeAdapter, setRuntimeAdapter } from "./context";
export type {
  OutboundEmailMessage,
  ServerRuntimeAdapter,
  MailNotificationEvent,
  CalendarNotificationEvent,
  MeetingRecorderRuntimeInput,
  MeetingRecorderRuntimeState,
  MeetingTranscriptYjsSegment,
} from "./contracts";

function getStringEnv(env: RuntimeEnv, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getRequiredStringEnv(env: RuntimeEnv, key: string): string {
  const value = getStringEnv(env, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function requestSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

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

export function getMailRealtimeWebSocketUrl(request: Request, env: RuntimeEnv) {
  const configured = getRuntimeAdapter().getMailRealtimeWebSocketUrl?.(
    request,
    env,
  );
  if (configured) return configured;
  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/mail-realtime";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getNavigationRealtimeWebSocketUrl(
  request: Request,
  env: RuntimeEnv,
) {
  const explicitUrl = getStringEnv(env, "NAVIGATION_REALTIME_WEBSOCKET_URL");
  if (explicitUrl) return explicitUrl;
  const configured = getRuntimeAdapter().getNavigationRealtimeWebSocketUrl?.(
    request,
    env,
  );
  if (configured) return configured;
  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/navigation-realtime";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function publishMailNotification(
  env: RuntimeEnv,
  event: MailNotificationEvent,
) {
  await getRuntimeAdapter().publishMailNotification?.({ env, event });
}

export function getDatabaseUrl(env: RuntimeEnv) {
  const adapterUrl = getRuntimeAdapter().getDatabaseUrl?.(env);

  if (adapterUrl) {
    return adapterUrl;
  }

  return getRequiredStringEnv(env, "DATABASE_URL");
}

export async function fetchAutomationWebhook(input: {
  body: string;
  headers: Record<string, string>;
  pinnedAddress: string;
  timeoutMs: number;
  url: string;
}) {
  const adapter = getRuntimeAdapter();
  if (adapter.fetchAutomationWebhook) return adapter.fetchAutomationWebhook(input);
  if (adapter.selfHosted !== false) {
    throw new Error("A pinned webhook transport is required for self-hosted automations");
  }
  return fetch(input.url, {
    body: input.body,
    headers: input.headers,
    method: "POST",
    redirect: "manual",
    signal: requestSignal(input.timeoutMs),
    ...({ cf: { resolveOverride: input.pinnedAddress } } as Record<string, unknown>),
  });
}

export async function fetchMcpRequest(input: {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  signal?: AbortSignal;
  timeoutMs: number;
  url: string;
}) {
  const adapter = getRuntimeAdapter();
  if (adapter.fetchMcpRequest) return adapter.fetchMcpRequest(input);
  throw new Error("A secure MCP transport is required for MCP connections");
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

export function getCalendarRealtimeWebSocketUrl(request: Request, env: RuntimeEnv) {
  const configured = getRuntimeAdapter().getCalendarRealtimeWebSocketUrl?.(
    request,
    env,
  );
  if (configured) return configured;
  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/calendar-realtime";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function publishCalendarNotification(env: RuntimeEnv, event: CalendarNotificationEvent) {
  const publish = getRuntimeAdapter().publishCalendarNotification;
  if (!publish) throw new Error("Calendar realtime publisher unavailable");
  await publish({ env, event });
}
