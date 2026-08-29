import type { RuntimeEnv } from "../../shared/config/config";
import { runWithDbEnv } from "../../infrastructure/database";
import type { MeetingAudioTicketClaims } from "./meeting-audio-ticket";
import {
  meetingTranscriptSequence,
  type MeetingAudioSource,
} from "./meeting-audio-ticket";
import { appendMeetingTranscriptSegment } from "./meeting-service";

const AUDIO_PACKET_BYTES = 24_000 * 2 / 10;
const FRAME_BYTES = 480 * 2;
const MINIMUM_COMMIT_BYTES = AUDIO_PACKET_BYTES;
const FINAL_TRANSCRIPT_TIMEOUT_MS = 12_000;
const SILENCE_COMMIT_FRAMES = 25;
const LEADING_SILENCE_CLEAR_FRAMES = 250;
const MAX_TURN_FRAMES = 30 * 50;
const SPEECH_RMS_THRESHOLD = 0.012;
const NON_RETRYABLE_PROVIDER_CODES = new Set([
  "authentication_error",
  "invalid_api_key",
  "invalid_model",
  "invalid_parameter",
  "invalid_request_error",
  "invalid_value",
  "model_not_found",
  "permission_denied",
]);

export const MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE = 4400;

type SocketMessageEvent = { data: unknown };
type SocketCloseEvent = {
  code?: number;
  reason?: string;
  wasClean?: boolean;
};
type SocketErrorEvent = {
  error?: unknown;
  message?: string;
};

export type RealtimeTranscriptionSocket = {
  addEventListener(
    type: "close",
    listener: (event: SocketCloseEvent) => void,
  ): void;
  addEventListener(
    type: "error",
    listener: (event: SocketErrorEvent) => void,
  ): void;
  addEventListener(
    type: "message",
    listener: (event: SocketMessageEvent) => void,
  ): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
};

export type RealtimeTranscriptionTurn = {
  endSequence: number;
  itemId: string;
  startSequence: number;
  text: string;
};

type TurnRange = Omit<RealtimeTranscriptionTurn, "itemId" | "text">;

type PendingManualCommit = {
  itemId: string | null;
  turn: TurnRange;
};

export type MeetingRealtimeTranscriberCallbacks = {
  onCompleted(turn: RealtimeTranscriptionTurn): Promise<void> | void;
  onDelta(turn: RealtimeTranscriptionTurn): Promise<void> | void;
  onError?(error: Error): void;
  onReady?(): void;
};

export class MeetingRealtimeTranscriptionError extends Error {
  constructor(
    readonly providerCode: string,
    readonly retryable: boolean,
    readonly providerParam?: string,
    readonly providerMessage?: string,
  ) {
    super(
      `Realtime transcription provider error (${providerCode})` +
        (providerParam ? ` at ${providerParam}` : "") +
        (providerMessage ? `: ${providerMessage}` : ""),
    );
    this.name = "MeetingRealtimeTranscriptionError";
  }
}

export function getMeetingRealtimeTranscriptionUrl(
  protocol: "https" | "wss",
) {
  return `${protocol}://api.openai.com/v1/realtime?intent=transcription`;
}

/**
 * OpenAI recommends a stable, privacy-preserving safety identifier when a
 * backend connects on behalf of an end user. Hashing the internal user ID
 * keeps the identifier stable across reconnects without disclosing it.
 */
export async function getMeetingOpenAiSafetyIdentifier(userId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`zilobase-meeting:${userId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Removes audio frames the server has already accepted. A reconnect can land
 * in the middle of a five-frame transport batch, so rejecting the entire
 * overlapping batch would otherwise create a gap in the transcript.
 */
export function trimAcceptedMeetingAudio(
  pcm: Uint8Array,
  sequence: number,
  lastAcceptedSequence: number,
) {
  if (pcm.byteLength === 0 || pcm.byteLength % FRAME_BYTES !== 0) return null;
  const frameCount = pcm.byteLength / FRAME_BYTES;
  const endSequence = sequence + frameCount - 1;
  if (!Number.isSafeInteger(endSequence) || endSequence <= lastAcceptedSequence) {
    return null;
  }
  const skippedFrames = Math.max(0, lastAcceptedSequence - sequence + 1);
  return {
    endSequence,
    pcm: skippedFrames === 0
      ? pcm
      : pcm.subarray(skippedFrames * FRAME_BYTES),
    sequence: sequence + skippedFrames,
  };
}

export function getMeetingTranscriptionFailureCloseCode(error: unknown) {
  return error instanceof MeetingRealtimeTranscriptionError && !error.retryable
    ? MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE
    : 1011;
}

export function getMeetingRealtimeTranscriptionConfig(env: RuntimeEnv) {
  const apiKey = typeof env.OPENAI_API_KEY === "string"
    ? env.OPENAI_API_KEY.trim()
    : "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for meeting transcription");
  }
  const configuredModel = typeof env.OPENAI_REALTIME_TRANSCRIPTION_MODEL === "string"
    ? env.OPENAI_REALTIME_TRANSCRIPTION_MODEL.trim()
    : "";
  return {
    apiKey,
    model: configuredModel || "gpt-live-transcribe",
  };
}

export class MeetingRealtimeTranscriber {
  private bufferedAudioEndSequence = -1;
  private bufferedAudioStartSequence: number | null = null;
  private bufferedFrameCount = 0;
  private callbackQueue = Promise.resolve();
  private readonly completedTurns = new Map<string, RealtimeTranscriptionTurn>();
  private currentProviderItemId: string | null = null;
  private currentTurn: TurnRange | null = null;
  private fatalError: Error | null = null;
  private finishing = false;
  private finishWake: (() => void) | null = null;
  private itemText = new Map<string, string>();
  private lastCommittedEndSequence = -1;
  private latestSequence = -1;
  private readonly outstandingItems = new Set<string>();
  private readonly pendingManualCommits: PendingManualCommit[] = [];
  private packetBytes = 0;
  private packets: Uint8Array[] = [];
  private ready = false;
  private sessionStartSequence: number | null = null;
  private silenceFrameCount = 0;
  private turnOrder: string[] = [];
  private readonly turnsByItem = new Map<string, TurnRange>();

  constructor(
    private readonly socket: RealtimeTranscriptionSocket,
    private readonly model: string,
    private readonly callbacks: MeetingRealtimeTranscriberCallbacks,
  ) {
    socket.addEventListener("message", (event) => this.onProviderMessage(event.data));
    socket.addEventListener("error", (event) => {
      const detail = sanitizeProviderDetail(
        event.message ?? (event.error instanceof Error ? event.error.message : undefined),
        300,
      );
      this.fail(new Error(
        "Realtime transcription WebSocket failed" + (detail ? `: ${detail}` : ""),
      ));
    });
    socket.addEventListener("close", (event) => {
      if (!this.finishing) this.fail(providerSocketCloseError(event));
      this.finishWake?.();
    });
    this.send({
      session: {
        audio: {
          input: {
            format: { rate: 24_000, type: "audio/pcm" },
            transcription: getRealtimeTranscriptionOptions(model),
            turn_detection: null,
          },
        },
        type: "transcription",
      },
      type: "session.update",
    });
  }

  appendAudio(pcm: Uint8Array, sequence: number) {
    if (this.finishing || this.fatalError) return;
    const frameCount = Math.floor(pcm.byteLength / FRAME_BYTES);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      this.appendFrame(
        pcm.subarray(frameIndex * FRAME_BYTES, (frameIndex + 1) * FRAME_BYTES),
        sequence + frameIndex,
      );
    }
  }

  async finish() {
    if (this.finishing) return this.callbackQueue;
    this.finishing = true;
    this.flushPackets();
    this.commitRemainingAudio();
    let timedOut = false;
    if (this.hasOutstandingTranscripts() && !this.fatalError) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          timedOut = true;
          resolve();
        }, FINAL_TRANSCRIPT_TIMEOUT_MS);
        this.finishWake = () => {
          if (this.hasOutstandingTranscripts() && !this.fatalError) return;
          clearTimeout(timeout);
          resolve();
        };
      });
    }
    this.finishWake = null;
    if (timedOut && this.hasOutstandingTranscripts() && !this.fatalError) {
      this.fatalError = new Error(
        "Timed out waiting for the final realtime transcription turn",
      );
    }
    this.drainCompletedTurns(true);
    this.closeSocket(1000, "Meeting audio finished");
    await this.callbackQueue;
    if (this.fatalError) throw this.fatalError;
  }

  abort() {
    if (this.finishing) return;
    this.finishing = true;
    this.packets = [];
    this.packetBytes = 0;
    this.resetBufferedAudio();
    this.outstandingItems.clear();
    this.pendingManualCommits.length = 0;
    this.completedTurns.clear();
    this.turnOrder = [];
    this.turnsByItem.clear();
    this.closeSocket(1000, "Meeting transcription aborted");
    this.finishWake?.();
  }

  private commitRemainingAudio() {
    if (this.bufferedAudioStartSequence === null) return;
    if (this.bufferedFrameCount * FRAME_BYTES < MINIMUM_COMMIT_BYTES) {
      this.send({ type: "input_audio_buffer.clear" });
      this.resetBufferedAudio();
      return;
    }
    this.commitBufferedAudio(this.currentTurn ?? {
      endSequence: this.bufferedAudioEndSequence,
      startSequence: this.bufferedAudioStartSequence,
    });
  }

  private appendFrame(frame: Uint8Array, sequence: number) {
    this.sessionStartSequence ??= sequence;
    this.latestSequence = Math.max(this.latestSequence, sequence);
    this.bufferedAudioStartSequence ??= sequence;
    this.bufferedAudioEndSequence = Math.max(
      this.bufferedAudioEndSequence,
      sequence,
    );
    this.bufferedFrameCount += 1;
    this.packets.push(frame);
    this.packetBytes += frame.byteLength;

    if (isSpeechPcmFrame(frame)) {
      this.currentTurn ??= { endSequence: sequence, startSequence: sequence };
      this.currentTurn.endSequence = Math.max(
        this.currentTurn.endSequence,
        sequence,
      );
      this.silenceFrameCount = 0;
    } else if (this.currentTurn) {
      this.silenceFrameCount += 1;
    }

    if (this.packetBytes >= AUDIO_PACKET_BYTES) this.flushPackets();

    if (
      this.currentTurn &&
      (
        this.silenceFrameCount >= SILENCE_COMMIT_FRAMES ||
        this.bufferedFrameCount >= MAX_TURN_FRAMES
      )
    ) {
      this.flushPackets();
      this.commitBufferedAudio(this.currentTurn);
      return;
    }

    if (
      !this.currentTurn &&
      this.bufferedFrameCount >= LEADING_SILENCE_CLEAR_FRAMES
    ) {
      this.flushPackets();
      this.send({ type: "input_audio_buffer.clear" });
      this.resetBufferedAudio();
    }
  }

  private commitBufferedAudio(turn: TurnRange) {
    const committedEndSequence = this.bufferedAudioEndSequence;
    this.pendingManualCommits.push({
      itemId: this.currentProviderItemId,
      turn,
    });
    if (this.currentProviderItemId) {
      this.outstandingItems.add(this.currentProviderItemId);
      this.addTurnOrder(this.currentProviderItemId);
    }
    this.lastCommittedEndSequence = Math.max(
      this.lastCommittedEndSequence,
      committedEndSequence,
    );
    this.send({ type: "input_audio_buffer.commit" });
    this.resetBufferedAudio();
  }

  private resetBufferedAudio() {
    this.bufferedAudioStartSequence = null;
    this.bufferedAudioEndSequence = -1;
    this.bufferedFrameCount = 0;
    this.currentProviderItemId = null;
    this.currentTurn = null;
    this.silenceFrameCount = 0;
  }

  private fail(error: Error) {
    if (this.fatalError) return;
    this.fatalError = error;
    try {
      this.callbacks.onError?.(error);
    } catch {
      // Provider failures must not escape WebSocket event handlers.
    }
    this.finishWake?.();
  }

  private flushPackets() {
    if (this.packetBytes === 0) return;
    const pcm = new Uint8Array(this.packetBytes);
    let offset = 0;
    for (const packet of this.packets) {
      pcm.set(packet, offset);
      offset += packet.byteLength;
    }
    this.packets = [];
    this.packetBytes = 0;
    this.send({ audio: bytesToBase64(pcm), type: "input_audio_buffer.append" });
  }

  private onProviderMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = typeof event.type === "string" ? event.type : "";
    const itemId = typeof event.item_id === "string" ? event.item_id : "";
    if (type === "session.updated") {
      if (!this.ready) {
        this.ready = true;
        try {
          this.callbacks.onReady?.();
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)));
        }
      }
      return;
    }
    if (type === "error") {
      const providerError = event.error && typeof event.error === "object"
        ? event.error as Record<string, unknown>
        : null;
      const code = typeof providerError?.code === "string"
        ? providerError.code.replace(/[^a-z0-9_.-]/gi, "").slice(0, 80)
        : "provider_error";
      const providerType = typeof providerError?.type === "string"
        ? providerError.type.replace(/[^a-z0-9_.-]/gi, "").slice(0, 80)
        : "";
      const providerParam = sanitizeProviderDetail(providerError?.param, 160);
      const providerMessage = sanitizeProviderDetail(providerError?.message, 500);
      this.fail(new MeetingRealtimeTranscriptionError(
        code,
        !NON_RETRYABLE_PROVIDER_CODES.has(code)
          && !NON_RETRYABLE_PROVIDER_CODES.has(providerType),
        providerParam,
        providerMessage,
      ));
      return;
    }
    if (type === "input_audio_buffer.committed" && itemId) {
      const turn = this.resolveTurn(itemId) ?? this.createFallbackTurn();
      this.turnsByItem.set(itemId, turn);
      this.outstandingItems.add(itemId);
      this.addTurnOrder(itemId);
      this.removePendingManualCommit(turn);
      return;
    }
    if (
      type === "conversation.item.input_audio_transcription.delta"
      && itemId
      && typeof event.delta === "string"
    ) {
      const text = `${this.itemText.get(itemId) ?? ""}${event.delta}`;
      this.itemText.set(itemId, text);
      const turn = this.resolveTurn(itemId);
      if (turn) this.queueCallback(() => this.callbacks.onDelta({
        ...turn,
        itemId,
        text,
      }));
      return;
    }
    if (
      type === "conversation.item.input_audio_transcription.completed"
      && itemId
    ) {
      const turn = this.resolveTurn(itemId);
      const text = typeof event.transcript === "string"
        ? event.transcript.trim()
        : (this.itemText.get(itemId) ?? "").trim();
      this.itemText.delete(itemId);
      this.turnsByItem.delete(itemId);
      this.outstandingItems.delete(itemId);
      if (turn) this.removePendingManualCommit(turn);
      if (turn) {
        this.completedTurns.set(itemId, { ...turn, itemId, text });
        this.addTurnOrder(itemId);
        this.drainCompletedTurns(false);
      }
      this.finishWake?.();
    }
  }

  private queueCallback(callback: () => Promise<void> | void) {
    this.callbackQueue = this.callbackQueue.then(callback).catch((error) => {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    });
  }

  private resolveTurn(itemId: string) {
    const existing = this.turnsByItem.get(itemId);
    if (existing) return existing;
    const pending = this.pendingManualCommits.find((entry) =>
      entry.itemId === itemId
    ) ?? this.pendingManualCommits.find((entry) => entry.itemId === null);
    if (pending) pending.itemId = itemId;
    const turn = pending?.turn ?? this.currentTurn ?? this.createFallbackTurn();
    this.turnsByItem.set(itemId, turn);
    this.outstandingItems.add(itemId);
    this.addTurnOrder(itemId);
    if (!pending && this.currentTurn === turn) {
      this.currentProviderItemId = itemId;
    }
    return turn;
  }

  private createFallbackTurn(): TurnRange {
    const startSequence = Math.max(
      this.bufferedAudioStartSequence ?? this.sessionStartSequence ?? 0,
      this.lastCommittedEndSequence + 1,
    );
    return {
      endSequence: Math.max(
        startSequence,
        this.bufferedAudioEndSequence,
        this.latestSequence,
      ),
      startSequence,
    };
  }

  private removePendingManualCommit(turn: TurnRange) {
    const index = this.pendingManualCommits.findIndex((entry) =>
      entry.turn === turn
    );
    if (index >= 0) this.pendingManualCommits.splice(index, 1);
  }

  private hasOutstandingTranscripts() {
    return this.currentTurn !== null
      || this.outstandingItems.size > 0
      || this.pendingManualCommits.length > 0;
  }

  private addTurnOrder(itemId: string) {
    if (!this.turnOrder.includes(itemId)) this.turnOrder.push(itemId);
    this.turnOrder.sort((left, right) => {
      const leftStart = this.turnsByItem.get(left)?.startSequence
        ?? this.completedTurns.get(left)?.startSequence
        ?? Number.MAX_SAFE_INTEGER;
      const rightStart = this.turnsByItem.get(right)?.startSequence
        ?? this.completedTurns.get(right)?.startSequence
        ?? Number.MAX_SAFE_INTEGER;
      return leftStart - rightStart;
    });
  }

  private drainCompletedTurns(force: boolean) {
    while (this.turnOrder.length > 0) {
      const itemId = this.turnOrder[0];
      const turn = this.completedTurns.get(itemId);
      if (!turn) {
        if (!force) return;
        this.turnOrder.shift();
        continue;
      }
      this.turnOrder.shift();
      this.completedTurns.delete(itemId);
      this.queueCallback(() => this.callbacks.onCompleted(turn));
    }
  }

  private send(event: object) {
    if (this.fatalError) return;
    try {
      this.socket.send(JSON.stringify(event));
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private closeSocket(code: number, reason: string) {
    try {
      this.socket.close(code, reason);
    } catch {
      // The provider may already have dropped the outbound connection.
    }
  }
}

function getRealtimeTranscriptionOptions(model: string) {
  // The low-latency delay control is part of the gpt-live-transcribe
  // configuration. Commit-based transcription models reject that field.
  return model === "gpt-live-transcribe"
    ? { delay: "minimal", model }
    : { model };
}

function isSpeechPcmFrame(frame: Uint8Array) {
  if (frame.byteLength < 2) return false;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let squareSum = 0;
  const sampleCount = Math.floor(frame.byteLength / 2);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const sample = view.getInt16(sampleIndex * 2, true) / 0x8000;
    squareSum += sample * sample;
  }
  return Math.sqrt(squareSum / sampleCount) >= SPEECH_RMS_THRESHOLD;
}

function sanitizeProviderDetail(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const sanitized = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
  return sanitized || undefined;
}

function providerSocketCloseError(event: SocketCloseEvent) {
  const code = Number.isInteger(event.code) ? event.code : 1006;
  const reason = sanitizeProviderDetail(event.reason, 300);
  const providerCode = reason
    ? [...NON_RETRYABLE_PROVIDER_CODES].find((candidate) =>
      reason.split(/[^a-z0-9_-]+/i).includes(candidate)
    )
    : undefined;
  const detail = `WebSocket closed with code ${code}`
    + (reason ? `: ${reason}` : "")
    + (typeof event.wasClean === "boolean" ? ` (clean=${event.wasClean})` : "");
  return providerCode
    ? new MeetingRealtimeTranscriptionError(
      providerCode,
      false,
      undefined,
      detail,
    )
    : new Error(`Realtime transcription ${detail}`);
}

export function createMeetingRealtimeTranscriptSink(
  env: RuntimeEnv,
  claims: MeetingAudioTicketClaims,
  publishDelta?: (turn: RealtimeTranscriptionTurn) => void,
  source: MeetingAudioSource = "microphone",
) {
  return {
    async onCompleted(turn: RealtimeTranscriptionTurn) {
      if (turn.text) {
        await runWithDbEnv(env, () => appendMeetingTranscriptSegment({
          draftItemId: turn.itemId,
          endMs: (turn.endSequence + 1) * 20,
          env,
          meetingId: claims.meetingId,
          providerItemId: `${claims.leaseId}:${turn.itemId}`,
          sequence: meetingTranscriptSequence(source, turn.startSequence),
          source,
          startMs: turn.startSequence * 20,
          text: turn.text,
          userId: claims.userId,
        }));
      }
      publishDelta?.({ ...turn, text: "" });
    },
    onDelta(turn: RealtimeTranscriptionTurn) {
      if (!turn.text.trim()) return;
      publishDelta?.(turn);
    },
  } satisfies MeetingRealtimeTranscriberCallbacks;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
