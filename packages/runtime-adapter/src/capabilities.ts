import { getRuntimePorts } from "./context";
import type {
  CalendarNotificationEvent,
  MailNotificationEvent,
  RuntimeEnv,
} from "./contracts";

export {
  getRuntimePorts,
  runWithRuntimePorts,
} from "./context";
export type {
  OutboundEmailMessage,
  MailNotificationEvent,
  CalendarNotificationEvent,
  MeetingRecorderRuntimeInput,
  MeetingRecorderRuntimeState,
  MeetingTranscriptYjsSegment,
} from "./contracts";

export function getDatabaseRealtimeWebSocketUrl(
  request: Request,
) {
  return requireRuntimePort("urls").getCollabUrl("database", request);
}

export function getCollaborationWebSocketUrl(
  request: Request,
) {
  return requireRuntimePort("urls").getCollabUrl("collaboration", request);
}

export function getMeetingCollaborationWebSocketUrl(
  request: Request,
) {
  return requireRuntimePort("urls").getCollabUrl("meeting-collaboration", request);
}

export function getMeetingAudioWebSocketUrl(
  request: Request,
) {
  return requireRuntimePort("urls").getCollabUrl("meeting-audio", request);
}

export function getMailRealtimeWebSocketUrl(request: Request) {
  return requireRuntimePort("urls").getCollabUrl("mail", request);
}

export function getNavigationRealtimeWebSocketUrl(
  request: Request,
) {
  return requireRuntimePort("urls").getCollabUrl("navigation", request);
}

export async function publishMailNotification(
  event: MailNotificationEvent,
) {
  await requireRuntimePort("fanout").publish(`mail:${event.userId}`, event);
}

export function getDatabaseUrl(env: RuntimeEnv) {
  const direct = env.DATABASE_URL;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const runtimeEnv = requireRuntimePort("env");
  return runtimeEnv.require("DATABASE_URL");
}

export async function fetchAutomationWebhook(input: {
  body: string;
  headers: Record<string, string>;
  pinnedAddress: string;
  timeoutMs: number;
  url: string;
}) {
  return requireRuntimePort("outbound").fetchWebhook({ ...input, method: "POST" });
}

export async function fetchMcpRequest(input: {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  signal?: AbortSignal;
  timeoutMs: number;
  url: string;
}) {
  return requireRuntimePort("outbound").fetchMcp(input);
}

export function getCalendarRealtimeWebSocketUrl(request: Request) {
  return requireRuntimePort("urls").getCollabUrl("calendar", request);
}

export async function publishCalendarNotification(event: CalendarNotificationEvent) {
  await requireRuntimePort("fanout").publish(`calendar:${event.bindingId}`, event);
}

export function requireRuntimePort<
  Key extends keyof ReturnType<typeof getRuntimePorts>,
>(key: Key) {
  const port = getRuntimePorts()[key];
  if (!port) throw new Error(`Runtime ${String(key)} port is required`);
  return port;
}
