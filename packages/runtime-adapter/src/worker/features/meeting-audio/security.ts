import {
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
  verifyMeetingAudioTicket,
  type MeetingAudioTicketClaims,
} from "@zilobase/server/realtime-api";
import type { RuntimeEnv } from "@zilobase/server/adapter-api";

export const MEETING_AUDIO_CLAIMS_HEADER = "x-zilobase-meeting-audio-claims";
const MAX_TICKET_BYTES = 8 * 1024;

export type MeetingAudioRouteEnv = RuntimeEnv & {
  BETTER_AUTH_SECRET: string;
  COLLABORATION_SECRET?: string;
  COLLABORATION_RATE_LIMITER: Pick<RateLimit, "limit">;
  MEETING_COLLABORATION: {
    getByName(name: string): { fetch(request: Request): Promise<Response> };
  };
};

export async function routeMeetingAudioRequest(
  request: Request,
  env: MeetingAudioRouteEnv,
  _ctx?: Pick<ExecutionContext, "waitUntil">,
  openSession?: (
    claims: MeetingAudioTicketClaims,
    env: MeetingAudioRouteEnv,
  ) => Promise<Response>,
) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const meetingId = new URL(request.url).searchParams.get("meeting");
  const token = readAuthentication(request.headers);
  if (!meetingId || !token) return new Response("Unauthorized", { status: 401 });

  let claims: MeetingAudioTicketClaims;
  try {
    claims = await verifyMeetingAudioTicket(token, env);
    if (claims.meetingId !== meetingId) throw new Error("Ticket scope mismatch");
  } catch {
    return new Response("Invalid meeting audio ticket", { status: 401 });
  }

  const clientAddress = request.headers.get("cf-connecting-ip") ?? "local";
  const rate = await env.COLLABORATION_RATE_LIMITER.limit({
    key: `meeting-audio:${clientAddress}:${meetingId}`,
  });
  if (!rate.success) {
    return new Response("Too Many Requests", {
      headers: { "Retry-After": "60" },
      status: 429,
    });
  }

  if (openSession) return openSession(claims, env);

  const headers = new Headers(request.headers);
  headers.set(
    MEETING_AUDIO_CLAIMS_HEADER,
    encodeURIComponent(JSON.stringify(claims)),
  );
  return env.MEETING_COLLABORATION
    .getByName(`meeting:${claims.meetingId}`)
    .fetch(new Request(request, { headers }));
}

export function readMeetingAudioClaims(headers: Headers) {
  const encoded = headers.get(MEETING_AUDIO_CLAIMS_HEADER);
  if (!encoded) return null;
  try {
    const value = JSON.parse(
      decodeURIComponent(encoded),
    ) as MeetingAudioTicketClaims;
    return value &&
        typeof value.meetingId === "string" &&
        typeof value.leaseId === "string" &&
        typeof value.userId === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

function readAuthentication(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim());
  const auth = protocols.find((value) =>
    value.startsWith(MEETING_AUDIO_AUTH_PROTOCOL_PREFIX)
  );
  const token = auth?.slice(MEETING_AUDIO_AUTH_PROTOCOL_PREFIX.length);
  return protocols.includes(MEETING_AUDIO_PROTOCOL) &&
      token && token.length <= MAX_TICKET_BYTES
    ? token
    : null;
}
