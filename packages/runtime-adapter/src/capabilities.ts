import { getRuntimePorts } from "./context";
import type {
  CalendarNotificationEvent,
  MailNotificationEvent,
  RuntimeEnv,
} from "./contracts";

export {
  getRuntimeAdapter,
  getRuntimePorts,
  runWithRuntimeAdapter,
  runWithRuntimePorts,
  setRuntimeAdapter,
  setRuntimePorts,
} from "./context";
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

export function getDatabaseRealtimeWebSocketUrl(
  request: Request,
  _env: RuntimeEnv,
) {
  return requirePort("urls").getCollabUrl("database", request);
}

export function getCollaborationWebSocketUrl(
  request: Request,
  _env: RuntimeEnv,
) {
  return requirePort("urls").getCollabUrl("collaboration", request);
}

export function getMeetingCollaborationWebSocketUrl(
  request: Request,
  _env: RuntimeEnv,
) {
  return requirePort("urls").getCollabUrl("meeting-collaboration", request);
}

export function getMeetingAudioWebSocketUrl(
  request: Request,
  _env: RuntimeEnv,
) {
  return requirePort("urls").getCollabUrl("meeting-audio", request);
}

export function getMailRealtimeWebSocketUrl(request: Request, _env: RuntimeEnv) {
  return requirePort("urls").getCollabUrl("mail", request);
}

export function getNavigationRealtimeWebSocketUrl(
  request: Request,
  _env: RuntimeEnv,
) {
  return requirePort("urls").getCollabUrl("navigation", request);
}

export async function publishMailNotification(
  _env: RuntimeEnv,
  event: MailNotificationEvent,
) {
  await requirePort("fanout").publish(`mail:${event.userId}`, event);
}

export function getDatabaseUrl(env: RuntimeEnv) {
  return getRuntimePorts().env?.get("DATABASE_URL") ?? getRequiredStringEnv(env, "DATABASE_URL");
}

export async function fetchAutomationWebhook(input: {
  body: string;
  headers: Record<string, string>;
  pinnedAddress: string;
  timeoutMs: number;
  url: string;
}) {
  return requirePort("outbound").fetchWebhook({ ...input, method: "POST" });
}

export async function fetchMcpRequest(input: {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  signal?: AbortSignal;
  timeoutMs: number;
  url: string;
}) {
  return requirePort("outbound").fetchMcp(input);
}

export function isSelfHostedRuntime() {
  return getRuntimePorts().env?.get("ZILOBASE_EDITION") !== "hosted";
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

export function getCalendarRealtimeWebSocketUrl(request: Request, _env: RuntimeEnv) {
  return requirePort("urls").getCollabUrl("calendar", request);
}

export async function publishCalendarNotification(_env: RuntimeEnv, event: CalendarNotificationEvent) {
  await requirePort("fanout").publish(`calendar:${event.bindingId}`, event);
}

function requirePort<Key extends keyof ReturnType<typeof getRuntimePorts>>(key: Key) {
  const port = getRuntimePorts()[key];
  if (!port) throw new Error(`Runtime ${String(key)} port is required`);
  return port;
}
