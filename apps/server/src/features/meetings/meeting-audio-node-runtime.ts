import { Buffer } from "node:buffer";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { Peer } from "crossws";
import crossws from "crossws/adapters/node";

import type { RuntimeEnv } from "../../config";
import { runWithDbEnv } from "../../db";
import {
  appendMeetingTranscriptSegment,
  heartbeatMeetingRecorder,
  validateMeetingRecorderLease,
} from "./meeting-service";
import {
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
  verifyMeetingAudioTicket,
  type MeetingAudioTicketClaims,
} from "./meeting-audio-ticket";
import { pcmToWav, transcribeMeetingPcm } from "./meeting-transcription";

const MAX_AUDIO_FRAME_BYTES = 8 + 4_096;
const PCM_BYTES_PER_SECOND = 24_000 * 2;
const TRANSCRIPTION_WINDOW_BYTES = PCM_BYTES_PER_SECOND * 5;
const LEASE_HEARTBEAT_MS = 10_000;
const MAX_TICKET_BYTES = 8 * 1024;

type Attachment = {
  audio: Buffer[];
  audioBytes: number;
  claims: MeetingAudioTicketClaims;
  firstSequence: number | null;
  lastHeartbeatAt: number;
  lastSequence: number;
  pending: Promise<void>;
};

type RuntimeOptions = {
  transcribe?: (wav: Uint8Array, env: RuntimeEnv, language?: string) => Promise<string>;
};

export function attachNodeMeetingAudioRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: RuntimeOptions = {},
) {
  const attachments = new WeakMap<Peer, Attachment>();
  const active = new Set<Attachment>();
  const watermarks = new Map<string, number>();
  const transcribe = options.transcribe ?? ((wav, runtimeEnv) =>
    transcribeMeetingPcm(wav.subarray(44), runtimeEnv));
  const websocket = crossws({
    idleTimeout: 45,
    serverOptions: { maxPayload: MAX_AUDIO_FRAME_BYTES },
    hooks: {
      async upgrade(request) {
        const meetingId = new URL(request.url).searchParams.get("meeting");
        const authentication = readAudioAuthentication(request.headers);
        if (!meetingId || !authentication) {
          throw new Response("Missing meeting audio ticket", { status: 401 });
        }
        const claims = await verifyMeetingAudioTicket(authentication, env);
        if (claims.meetingId !== meetingId) {
          throw new Response("Meeting audio ticket scope does not match", {
            status: 403,
          });
        }
        await runWithDbEnv(env, () => validateMeetingRecorderLease(claims));
        return {
          context: { meetingAudio: { claims } },
          protocol: MEETING_AUDIO_PROTOCOL,
        };
      },
      open(peer) {
        const claims = readClaims(peer);
        if (!claims) {
          peer.close(1011, "Missing meeting audio session");
          return;
        }
        const attachment: Attachment = {
          audio: [],
          audioBytes: 0,
          claims,
          firstSequence: null,
          lastHeartbeatAt: Date.now(),
          lastSequence: watermarks.get(claims.leaseId) ?? -1,
          pending: Promise.resolve(),
        };
        attachments.set(peer, attachment);
        active.add(attachment);
        peer.send(JSON.stringify({
          leaseId: claims.leaseId,
          meetingId: claims.meetingId,
          nextSequence: attachment.lastSequence + 1,
          type: "meeting.ready",
        }));
      },
      message(peer, message) {
        const attachment = attachments.get(peer);
        if (!attachment) {
          peer.close(1011, "Missing meeting audio session");
          return;
        }
        if (typeof message.rawData === "string") {
          peer.close(1003, "Binary PCM16 audio frames are required");
          return;
        }
        const frame = Buffer.from(message.uint8Array());
        if (frame.byteLength < 10 || frame.byteLength > MAX_AUDIO_FRAME_BYTES) {
          peer.close(1009, "Invalid meeting audio frame");
          return;
        }
        const sequenceValue = frame.readBigUInt64LE(0);
        if (sequenceValue > BigInt(Number.MAX_SAFE_INTEGER)) {
          peer.close(1008, "Invalid meeting audio sequence");
          return;
        }
        const sequence = Number(sequenceValue);
        if (sequence <= attachment.lastSequence) return;
        if (frame.byteLength % 2 !== 0) {
          peer.close(1003, "PCM16 audio frames are required");
          return;
        }

        attachment.firstSequence ??= sequence;
        attachment.lastSequence = sequence;
        watermarks.set(attachment.claims.leaseId, sequence);
        const pcm = frame.subarray(8);
        attachment.audio.push(pcm);
        attachment.audioBytes += pcm.byteLength;
        if (attachment.audioBytes >= TRANSCRIPTION_WINDOW_BYTES) {
          queueFlush(peer, attachment, env, transcribe);
        }
        if (Date.now() - attachment.lastHeartbeatAt >= LEASE_HEARTBEAT_MS) {
          attachment.lastHeartbeatAt = Date.now();
          attachment.pending = attachment.pending.then(async () => {
            await runWithDbEnv(env, () =>
              heartbeatMeetingRecorder(attachment.claims),
            );
          });
        }
      },
      close(peer) {
        const attachment = attachments.get(peer);
        if (!attachment) return;
        if (attachment.audioBytes > 0) queueFlush(peer, attachment, env, transcribe);
        active.delete(attachment);
        void attachment.pending.catch(logRuntimeError);
      },
      error(peer, error) {
        logRuntimeError(error);
        peer.close(1011, "Meeting audio WebSocket error");
      },
    },
  });

  const upgradeListener = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    const url = new URL(request.url ?? "/", "http://zilobase.local");
    if (url.pathname !== "/meeting-audio") return;
    void websocket.handleUpgrade(request, socket, head).catch((error) => {
      logRuntimeError(error);
      rejectUpgrade(socket, 500, "Internal Server Error");
    });
  };
  server.on("upgrade", upgradeListener);

  return {
    async destroy() {
      server.off("upgrade", upgradeListener);
      await Promise.allSettled([...active].map((attachment) => attachment.pending));
      await websocket.close(1001, "Server shutting down");
    },
  };
}

function queueFlush(
  peer: Peer,
  attachment: Attachment,
  env: RuntimeEnv,
  transcribe: NonNullable<RuntimeOptions["transcribe"]>,
) {
  const pcm = Buffer.concat(attachment.audio, attachment.audioBytes);
  const firstSequence = attachment.firstSequence ?? attachment.lastSequence;
  const lastSequence = attachment.lastSequence;
  attachment.audio = [];
  attachment.audioBytes = 0;
  attachment.firstSequence = null;
  attachment.pending = attachment.pending
    .then(async () => {
      const text = (await transcribe(pcmToWav(pcm), env)).trim();
      if (!text) return;
      const segment = await runWithDbEnv(env, () =>
        appendMeetingTranscriptSegment({
          endMs: (lastSequence + 1) * 20,
          meetingId: attachment.claims.meetingId,
          providerItemId: `${attachment.claims.leaseId}:${firstSequence}-${lastSequence}`,
          sequence: firstSequence,
          startMs: firstSequence * 20,
          text,
        }),
      );
      if (segment) peer.send(JSON.stringify({ segment, type: "transcript.segment" }));
    })
    .catch(logRuntimeError);
}

function readAudioAuthentication(headers: Headers) {
  const protocols = (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((protocol) => protocol.trim());
  const authentication = protocols.find((protocol) =>
    protocol.startsWith(MEETING_AUDIO_AUTH_PROTOCOL_PREFIX)
  );
  const token = authentication?.slice(MEETING_AUDIO_AUTH_PROTOCOL_PREFIX.length);
  return protocols.includes(MEETING_AUDIO_PROTOCOL) && token && token.length <= MAX_TICKET_BYTES
    ? token
    : null;
}

function readClaims(peer: Peer) {
  const value = peer.context.meetingAudio;
  if (!value || typeof value !== "object") return null;
  const claims = (value as { claims?: unknown }).claims;
  return claims && typeof claims === "object"
    ? claims as MeetingAudioTicketClaims
    : null;
}

function rejectUpgrade(socket: Duplex, status: number, statusText: string) {
  socket.write(
    `HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

function logRuntimeError(error: unknown) {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    event: "meeting_audio_runtime_error",
  }));
}
