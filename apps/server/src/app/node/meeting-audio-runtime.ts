import { Buffer } from "node:buffer";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { Peer } from "crossws";
import crossws from "crossws/adapters/node";
import WebSocket from "ws";

import type { RuntimeEnv } from "../../shared/config/config";
import { runWithDbEnv } from "../../infrastructure/database";
import {
  heartbeatMeetingRecorder,
  MEETING_RECORDER_LEASE_HEARTBEAT_MS,
  transitionMeeting,
  validateMeetingRecorderLease,
} from "../../features/meetings/meeting-service";
import {
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
  MEETING_AUDIO_SOURCES,
  createMeetingAudioTicket,
  meetingAudioSourceFromCode,
  verifyMeetingAudioTicket,
  type MeetingAudioSource,
  type MeetingAudioTicketClaims,
} from "../../features/meetings/meeting-audio-ticket";
import {
  createMeetingRealtimeTranscriptSink,
  getMeetingOpenAiSafetyIdentifier,
  getMeetingRealtimeTranscriptionConfig,
  getMeetingRealtimeTranscriptionUrl,
  getMeetingTranscriptionFailureCloseCode,
  MeetingRealtimeTranscriber,
  trimAcceptedMeetingAudio,
  type MeetingRealtimeTranscriberCallbacks,
  type RealtimeTranscriptionSocket,
} from "../../features/meetings/meeting-realtime-transcription";

const PCM_FRAME_BYTES = 480 * 2;
const AUDIO_PACKET_HEADER_BYTES = 9;
const MAX_AUDIO_FRAME_BYTES = AUDIO_PACKET_HEADER_BYTES + PCM_FRAME_BYTES * 5;
const MAX_TICKET_BYTES = 8 * 1024;

type Attachment = {
  activeSources: MeetingAudioSource[];
  claims: MeetingAudioTicketClaims;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  lastHeartbeatAt: number;
  lastSequences: Record<MeetingAudioSource, number>;
  pending: Promise<void>;
  phase: "paused" | "recording" | "stopped";
  readySources: Set<MeetingAudioSource>;
  segmentCount: number;
  transcribers: Map<MeetingAudioSource, Promise<MeetingRealtimeTranscriber>>;
  transcriberGenerations: Record<MeetingAudioSource, number>;
};

type RuntimeOptions = {
  connect?: (
    env: RuntimeEnv,
    callbacks: MeetingRealtimeTranscriberCallbacks,
    claims: MeetingAudioTicketClaims,
  ) => Promise<MeetingRealtimeTranscriber>;
};

type AudioWatermark = {
  expiresAt: number;
  sequence: number;
};

const AUDIO_WATERMARK_TTL_MS = 15 * 60_000;
const MAX_AUDIO_WATERMARKS = 10_000;
const AUDIO_TICKET_REFRESH_LEAD_MS = 2 * 60_000;
const AUDIO_SOCKET_MAINTENANCE_MS = 30_000;

export function attachNodeMeetingAudioRuntime(
  server: HttpServer,
  env: RuntimeEnv,
  options: RuntimeOptions = {},
) {
  const attachments = new WeakMap<Peer, Attachment>();
  const active = new Set<Attachment>();
  const leaseTasks = new Map<string, Promise<void>>();
  const peersByLease = new Map<string, Peer>();
  const watermarks = new Map<string, AudioWatermark>();
  const connect = options.connect ?? connectOpenAiRealtimeTranscriber;
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
        pruneAudioWatermarks(watermarks);
        const previousPeer = peersByLease.get(claims.leaseId);
        if (previousPeer && previousPeer !== peer) {
          const previousAttachment = attachments.get(previousPeer);
          if (previousAttachment && previousAttachment.phase !== "stopped") {
            previousAttachment.phase = "stopped";
            clearAttachmentMaintenance(previousAttachment);
            const finishing = enqueueAttachmentTask(
              previousAttachment,
              () => finishCurrentTranscribers(previousAttachment),
            );
            const tracked = finishing
              .catch(logRuntimeError)
              .finally(() => active.delete(previousAttachment));
            leaseTasks.set(claims.leaseId, tracked);
            void tracked.finally(() => {
              if (leaseTasks.get(claims.leaseId) === tracked) {
                leaseTasks.delete(claims.leaseId);
              }
            });
          }
          previousPeer.close(1008, "Recorder reconnected");
        }
        peersByLease.set(claims.leaseId, peer);
        const attachment: Attachment = {
          activeSources: [],
          claims,
          heartbeatTimer: null,
          lastHeartbeatAt: Date.now(),
          lastSequences: { microphone: -1, system: -1 },
          pending: leaseTasks.get(claims.leaseId) ?? Promise.resolve(),
          phase: "recording",
          readySources: new Set(),
          segmentCount: 0,
          transcribers: new Map(),
          transcriberGenerations: { microphone: 0, system: 0 },
        };
        attachments.set(peer, attachment);
        active.add(attachment);
        startAttachmentMaintenance(peer, attachment, env);
      },
      message(peer, message) {
        const attachment = attachments.get(peer);
        if (!attachment) {
          peer.close(1011, "Missing meeting audio session");
          return;
        }
        if (typeof message.rawData === "string") {
          handleAudioControlMessage(
            peer,
            attachment,
            message.rawData,
            env,
            connect,
            watermarks,
          );
          return;
        }
        if (attachment.phase !== "recording") return;
        const frame = Buffer.from(message.uint8Array());
        if (
          frame.byteLength < AUDIO_PACKET_HEADER_BYTES + PCM_FRAME_BYTES ||
          frame.byteLength > MAX_AUDIO_FRAME_BYTES
        ) {
          peer.close(1009, "Invalid meeting audio frame");
          return;
        }
        const sequenceValue = frame.readBigUInt64LE(0);
        if (sequenceValue > BigInt(Number.MAX_SAFE_INTEGER)) {
          peer.close(1008, "Invalid meeting audio sequence");
          return;
        }
        const sequence = Number(sequenceValue);
        const source = meetingAudioSourceFromCode(frame[8]);
        if (!source || !attachment.activeSources.includes(source)) {
          peer.close(1008, "Invalid meeting audio source");
          return;
        }
        const transcriber = attachment.transcribers.get(source);
        if (!transcriber) return;
        const pcm = frame.subarray(AUDIO_PACKET_HEADER_BYTES);
        if (pcm.byteLength % PCM_FRAME_BYTES !== 0) {
          peer.close(1003, "PCM16 audio frames are required");
          return;
        }

        const accepted = trimAcceptedMeetingAudio(
          pcm,
          sequence,
          attachment.lastSequences[source],
        );
        if (!accepted) return;
        attachment.lastSequences[source] = accepted.endSequence;
        void transcriber
          .then((transcriber) =>
            transcriber.appendAudio(accepted.pcm, accepted.sequence)
          )
          .catch((error) => {
            logRuntimeError(error);
            peer.close(1011, "Meeting transcription failed");
          });
      },
      close(peer) {
        const attachment = attachments.get(peer);
        if (!attachment) return;
        if (peersByLease.get(attachment.claims.leaseId) === peer) {
          peersByLease.delete(attachment.claims.leaseId);
        }
        const finishing = attachment.phase === "stopped"
          ? attachment.pending
          : (() => {
              attachment.phase = "stopped";
              clearAttachmentMaintenance(attachment);
              return enqueueAttachmentTask(
                attachment,
                () => finishCurrentTranscribers(attachment),
              );
            })();
        const tracked = finishing
          .catch(logRuntimeError)
          .finally(() => active.delete(attachment));
        leaseTasks.set(attachment.claims.leaseId, tracked);
        void tracked.finally(() => {
          if (leaseTasks.get(attachment.claims.leaseId) === tracked) {
            leaseTasks.delete(attachment.claims.leaseId);
          }
        });
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
      const sessions = [...active];
      await websocket.close(1001, "Server shutting down");
      await Promise.allSettled(sessions.map((attachment) => {
        attachment.phase = "stopped";
        clearAttachmentMaintenance(attachment);
        return enqueueAttachmentTask(
          attachment,
          () => finishCurrentTranscribers(attachment),
        );
      }));
      active.clear();
      leaseTasks.clear();
      peersByLease.clear();
      watermarks.clear();
    },
  };
}

function startTranscribers(
  peer: Peer,
  attachment: Attachment,
  env: RuntimeEnv,
  connect: NonNullable<RuntimeOptions["connect"]>,
  watermarks: Map<string, AudioWatermark>,
) {
  attachment.readySources.clear();
  for (const source of attachment.activeSources) {
    startSourceTranscriber(peer, attachment, source, env, connect, watermarks);
  }
}

function startSourceTranscriber(
  peer: Peer,
  attachment: Attachment,
  source: MeetingAudioSource,
  env: RuntimeEnv,
  connect: NonNullable<RuntimeOptions["connect"]>,
  watermarks: Map<string, AudioWatermark>,
) {
  const generation = ++attachment.transcriberGenerations[source];
  const publicTurn = (turn: Parameters<MeetingRealtimeTranscriberCallbacks["onDelta"]>[0]) => ({
    ...turn,
    itemId: `${source}:${turn.itemId}`,
  });
  const sink = createMeetingRealtimeTranscriptSink(
    env,
    attachment.claims,
    (turn) => {
      peer.send(JSON.stringify({
        itemId: turn.itemId,
        source,
        startMs: turn.startSequence * 20,
        text: turn.text,
        type: "transcript.delta",
        updatedAt: Date.now(),
      }));
    },
    source,
  );
  const transcriber = attachment.pending.catch(() => undefined).then(() => {
    attachment.lastSequences[source] = Math.max(
      attachment.lastSequences[source],
      watermarks.get(audioWatermarkKey(attachment.claims.leaseId, source))?.sequence ?? -1,
    );
    return connect(env, {
      async onCompleted(turn) {
        await sink.onCompleted(publicTurn(turn));
        if (turn.text.trim()) attachment.segmentCount += 1;
        setAudioWatermark(
          watermarks,
          audioWatermarkKey(attachment.claims.leaseId, source),
          turn.endSequence,
        );
      },
      onDelta(turn) {
        sink.onDelta(publicTurn(turn));
      },
      onError(error) {
        if (generation !== attachment.transcriberGenerations[source]) return;
        logRuntimeError(error);
        peer.close(
          getMeetingTranscriptionFailureCloseCode(error),
          "Meeting transcription failed",
        );
      },
      onReady() {
        if (
          generation !== attachment.transcriberGenerations[source] ||
          attachment.phase !== "recording"
        ) return;
        attachment.readySources.add(source);
        announceReady(peer, attachment);
      },
    }, attachment.claims);
  });
  attachment.transcribers.set(source, transcriber);
  void transcriber.catch((error) => {
    if (generation !== attachment.transcriberGenerations[source]) return;
    logRuntimeError(error);
    peer.close(
      getMeetingTranscriptionFailureCloseCode(error),
      "Meeting transcription failed",
    );
  });
}

function handleAudioControlMessage(
  peer: Peer,
  attachment: Attachment,
  raw: string,
  env: RuntimeEnv,
  connect: NonNullable<RuntimeOptions["connect"]>,
  watermarks: Map<string, AudioWatermark>,
) {
  let message: { durationMs?: unknown; sources?: unknown; type?: unknown };
  try {
    message = JSON.parse(raw) as {
      durationMs?: unknown;
      sources?: unknown;
      type?: unknown;
    };
  } catch {
    peer.close(1003, "Invalid meeting audio control message");
    return;
  }

  if (message.type === "recording.configure") {
    const sources = parseMeetingAudioSources(message.sources);
    if (!sources || attachment.activeSources.length > 0) {
      peer.close(1008, "Invalid meeting audio sources");
      return;
    }
    attachment.activeSources = sources;
    for (const source of sources) {
      attachment.lastSequences[source] = watermarks.get(
        audioWatermarkKey(attachment.claims.leaseId, source),
      )?.sequence ?? -1;
    }
    startTranscribers(peer, attachment, env, connect, watermarks);
    return;
  }

  if (message.type === "recording.pause") {
    if (attachment.phase !== "recording") return;
    attachment.phase = "paused";
    const paused = enqueueAttachmentTask(attachment, async () => {
      await finishCurrentTranscribers(attachment);
      peer.send(JSON.stringify({ type: "recording.paused" }));
    });
    void paused.catch((error) => {
      logRuntimeError(error);
      peer.close(1011, "Meeting transcription failed");
    });
    return;
  }

  if (message.type === "recording.resume") {
    if (attachment.phase !== "paused") return;
    attachment.phase = "recording";
    startTranscribers(peer, attachment, env, connect, watermarks);
    return;
  }

  if (message.type === "recording.stop") {
    if (attachment.phase === "stopped") return;
    attachment.phase = "stopped";
    clearAttachmentMaintenance(attachment);
    const durationMs = typeof message.durationMs === "number" &&
        Number.isFinite(message.durationMs)
      ? Math.max(0, Math.min(10_800_000, Math.round(message.durationMs)))
      : meetingAudioDurationMs(attachment);
    const stopped = enqueueAttachmentTask(attachment, async () => {
      await finishCurrentTranscribers(attachment);
      await runWithDbEnv(env, () => transitionMeeting({
        action: "stop",
        durationMs,
        env,
        leaseId: attachment.claims.leaseId,
        meetingId: attachment.claims.meetingId,
        userId: attachment.claims.userId,
      }));
      peer.send(JSON.stringify({
        durationMs,
        segmentCount: attachment.segmentCount,
        type: "recording.flush.completed",
      }));
    });
    void stopped.catch((error) => {
      logRuntimeError(error);
      peer.send(JSON.stringify({
        message: "Could not finalize the completed transcript",
        type: "recording.error",
      }));
      peer.close(1011, "Meeting transcription failed");
    });
    return;
  }

  peer.close(1003, "Unknown meeting audio control message");
}

async function finishCurrentTranscribers(attachment: Attachment) {
  const transcribers = [...attachment.transcribers.values()];
  attachment.transcribers.clear();
  attachment.readySources.clear();
  for (const source of MEETING_AUDIO_SOURCES) {
    attachment.transcriberGenerations[source] += 1;
  }
  const results = await Promise.allSettled(transcribers.map(async (transcriber) => {
    await (await transcriber).finish();
  }));
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
}

function announceReady(peer: Peer, attachment: Attachment) {
  if (
    attachment.activeSources.length === 0 ||
    attachment.activeSources.some((source) => !attachment.readySources.has(source))
  ) return;
  peer.send(JSON.stringify({
    leaseId: attachment.claims.leaseId,
    meetingId: attachment.claims.meetingId,
    nextSequences: Object.fromEntries(attachment.activeSources.map((source) => [
      source,
      attachment.lastSequences[source] + 1,
    ])),
    type: "meeting.ready",
  }));
}

function parseMeetingAudioSources(value: unknown): MeetingAudioSource[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sources = [...new Set(value)];
  return sources.length === value.length && sources.every((source) =>
      MEETING_AUDIO_SOURCES.includes(source as MeetingAudioSource)
    )
    ? sources as MeetingAudioSource[]
    : null;
}

function meetingAudioDurationMs(attachment: Attachment) {
  return Math.max(
    0,
    ...attachment.activeSources.map((source) =>
      (attachment.lastSequences[source] + 1) * 20
    ),
  );
}

async function connectOpenAiRealtimeTranscriber(
  env: RuntimeEnv,
  callbacks: MeetingRealtimeTranscriberCallbacks,
  claims: MeetingAudioTicketClaims,
) {
  const { apiKey, model } = getMeetingRealtimeTranscriptionConfig(env);
  const safetyIdentifier = await getMeetingOpenAiSafetyIdentifier(claims.userId);
  const socket = new WebSocket(
    getMeetingRealtimeTranscriptionUrl("wss"),
    {
      handshakeTimeout: 15_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
    },
  );
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => {
      reject(new Error("Could not connect to realtime transcription provider"));
    }, { once: true });
  });
  return new MeetingRealtimeTranscriber(
    socket as unknown as RealtimeTranscriptionSocket,
    model,
    callbacks,
  );
}

function startAttachmentMaintenance(
  peer: Peer,
  attachment: Attachment,
  env: RuntimeEnv,
) {
  const timer = setInterval(() => {
    if (attachment.phase === "stopped") return;
    const maintenance = enqueueAttachmentTask(attachment, async () => {
      const now = Date.now();
      if (
        now - attachment.lastHeartbeatAt >=
        MEETING_RECORDER_LEASE_HEARTBEAT_MS
      ) {
        await runWithDbEnv(env, () =>
          heartbeatMeetingRecorder(attachment.claims),
        );
        attachment.lastHeartbeatAt = now;
      }
      if (attachment.claims.exp - now <= AUDIO_TICKET_REFRESH_LEAD_MS) {
        const ticket = await createMeetingAudioTicket(
          {
            leaseId: attachment.claims.leaseId,
            meetingId: attachment.claims.meetingId,
            recorderImage: attachment.claims.recorderImage,
            recorderName: attachment.claims.recorderName,
            userId: attachment.claims.userId,
            workspaceId: attachment.claims.workspaceId,
          },
          env,
        );
        attachment.claims = {
          ...attachment.claims,
          exp: new Date(ticket.expiresAt).getTime(),
        };
        peer.send(JSON.stringify({
          expiresAt: ticket.expiresAt,
          token: ticket.token,
          type: "recording.ticket",
        }));
      } else {
        peer.send(JSON.stringify({ type: "recording.heartbeat" }));
      }
    });
    void maintenance.catch((error) => {
      logRuntimeError(error);
      peer.close(1011, "Meeting recorder lease refresh failed");
    });
  }, AUDIO_SOCKET_MAINTENANCE_MS);
  timer.unref?.();
  attachment.heartbeatTimer = timer;
}

function clearAttachmentMaintenance(attachment: Attachment) {
  if (attachment.heartbeatTimer) clearInterval(attachment.heartbeatTimer);
  attachment.heartbeatTimer = null;
}

function enqueueAttachmentTask(
  attachment: Attachment,
  task: () => Promise<void>,
) {
  const pending = attachment.pending.catch(() => undefined).then(task);
  attachment.pending = pending;
  return pending;
}

function setAudioWatermark(
  watermarks: Map<string, AudioWatermark>,
  key: string,
  sequence: number,
) {
  watermarks.delete(key);
  watermarks.set(key, {
    expiresAt: Date.now() + AUDIO_WATERMARK_TTL_MS,
    sequence,
  });
  pruneAudioWatermarks(watermarks);
  while (watermarks.size > MAX_AUDIO_WATERMARKS) {
    const oldest = watermarks.keys().next().value;
    if (typeof oldest !== "string") break;
    watermarks.delete(oldest);
  }
}

function audioWatermarkKey(leaseId: string, source: MeetingAudioSource) {
  return `${leaseId}:${source}`;
}

function pruneAudioWatermarks(
  watermarks: Map<string, AudioWatermark>,
  now = Date.now(),
) {
  for (const [leaseId, watermark] of watermarks) {
    if (watermark.expiresAt <= now) watermarks.delete(leaseId);
  }
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
