import { Buffer } from "node:buffer";
import type { MeetingAudioSource } from "./meeting-contracts";

import type { RuntimeEnv } from "../../shared/config/config";

const TICKET_TTL_MS = 15 * 60 * 1000;

export const MEETING_AUDIO_PROTOCOL = "zilobase.meeting-audio.v2";
export const MEETING_AUDIO_AUTH_PROTOCOL_PREFIX =
  "zilobase.meeting-audio.auth.";

export type { MeetingAudioSource } from "./meeting-contracts";

export const MEETING_AUDIO_SOURCES = [
  "microphone",
  "system",
] as const satisfies readonly MeetingAudioSource[];

export function meetingAudioSourceCode(source: MeetingAudioSource) {
  return source === "microphone" ? 0 : 1;
}

export function meetingAudioSourceFromCode(code: number): MeetingAudioSource | null {
  if (code === 0) return "microphone";
  if (code === 1) return "system";
  return null;
}

export function meetingTranscriptSequence(
  source: MeetingAudioSource,
  audioSequence: number,
) {
  return audioSequence * MEETING_AUDIO_SOURCES.length + meetingAudioSourceCode(source);
}

export type MeetingAudioTicketClaims = {
  exp: number;
  leaseId: string;
  meetingId: string;
  recorderImage?: string | null;
  recorderName?: string;
  userId: string;
  workspaceId: string;
};

export async function createMeetingAudioTicket(
  claims: Omit<MeetingAudioTicketClaims, "exp">,
  env: RuntimeEnv,
) {
  const payload = { ...claims, exp: Date.now() + TICKET_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = await sign(encoded, ticketSecret(env));

  return {
    expiresAt: new Date(payload.exp).toISOString(),
    token: `${encoded}.${signature}`,
  };
}

export async function verifyMeetingAudioTicket(
  token: string,
  env: RuntimeEnv,
) {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw new Error("Invalid meeting audio ticket");

  const expected = await sign(encoded, ticketSecret(env));
  if (!constantTimeEqual(signature, expected)) {
    throw new Error("Invalid meeting audio ticket");
  }

  const claims = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as unknown;
  if (!isClaims(claims) || claims.exp <= Date.now()) {
    throw new Error("Expired meeting audio ticket");
  }
  return claims;
}

function ticketSecret(env: RuntimeEnv) {
  const value = env.COLLABORATION_SECRET ?? env.BETTER_AUTH_SECRET;
  if (typeof value !== "string" || !value) {
    throw new Error("COLLABORATION_SECRET or BETTER_AUTH_SECRET is required");
  }
  return value;
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  ).toString("base64url");
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function isClaims(value: unknown): value is MeetingAudioTicketClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.exp === "number" &&
    typeof claims.leaseId === "string" &&
    typeof claims.meetingId === "string" &&
    (claims.recorderImage === undefined ||
      claims.recorderImage === null ||
      typeof claims.recorderImage === "string") &&
    (claims.recorderName === undefined || typeof claims.recorderName === "string") &&
    typeof claims.userId === "string" &&
    typeof claims.workspaceId === "string"
  );
}
