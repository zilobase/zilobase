import type { MeetingCaptureSource, MeetingTranscriptDraft } from "./types";
import { FRAME_SAMPLES } from "./browser-audio-processing";
const TRANSPORT_BATCH_FRAMES = 5;

const MAX_TRANSPORT_FRAMES = 1_500;

type BrowserMeetingTransportState = "failed" | "paused" | "recording" | "stopped";

type BrowserMeetingTransportDependencies = {
  clearTimeout: (timer: number) => void;
  createSocket: (url: string, protocols: string[]) => WebSocket;
  resolveUrl: (url: string) => URL;
  setTimeout: (callback: () => void, delay: number) => number;
};

const defaultBrowserMeetingTransportDependencies: BrowserMeetingTransportDependencies = {
  clearTimeout: (timer) => window.clearTimeout(timer),
  createSocket: (url, protocols) => new WebSocket(url, protocols),
  resolveUrl: (url) => new URL(url, window.location.href),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
};

const MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS = 6;

const MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE = 4400;

const TRANSCRIPTION_STABLE_CONNECTION_MS = 30_000;

export class BrowserMeetingTransport {
  private audioTicket: string;
  private audioWebsocketUrl: string;
  private readonly dependencies: BrowserMeetingTransportDependencies;
  private readonly onWarning: (message: string) => void;
  private readonly onTranscript: (draft: Omit<MeetingTranscriptDraft, "meetingId"> | null) => void;
  private readonly activeSources: MeetingCaptureSource[];
  private inFlight: Uint8Array[] = [];
  private pendingSamples: Record<MeetingCaptureSource, Float32Array[]> = {
    microphone: [],
    system: [],
  };
  private pendingSampleCounts: Record<MeetingCaptureSource, number> = {
    microphone: 0,
    system: 0,
  };
  private pendingSequences: Record<MeetingCaptureSource, number | null> = {
    microphone: null,
    system: null,
  };
  private queue: Uint8Array[] = [];
  private reconnectAttempt = 0;
  private reconnectResetTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private sequences: Record<MeetingCaptureSource, number> = {
    microphone: 0,
    system: 0,
  };
  private socket: WebSocket | null = null;
  private state: BrowserMeetingTransportState = "stopped";
  private providerReady = false;
  private readonly eventWaiters = new Map<
    string,
    {
      reject: (reason: Error) => void;
      resolve: () => void;
      timer: number;
    }
  >();

  constructor(
    url: string,
    ticket: string,
    onWarning: (message: string) => void,
    dependencies: BrowserMeetingTransportDependencies = defaultBrowserMeetingTransportDependencies,
    onTranscript: (draft: Omit<MeetingTranscriptDraft, "meetingId"> | null) => void = () =>
      undefined,
    activeSources: MeetingCaptureSource[] = ["microphone"],
  ) {
    this.audioWebsocketUrl = url;
    this.audioTicket = ticket;
    this.dependencies = dependencies;
    this.onWarning = onWarning;
    this.onTranscript = onTranscript;
    this.activeSources = [...activeSources];
  }

  start() {
    if (this.state !== "stopped") return;
    this.reconnectAttempt = 0;
    this.state = "recording";
    this.connect();
  }

  async pause() {
    if (this.state !== "recording") return;
    this.flushSamples();
    this.drainQueue(true);
    this.state = "paused";
    this.cancelReconnect();
    this.cancelReconnectReset();
    if (this.socket?.readyState === 1) {
      const paused = this.waitForEvent("recording.paused");
      this.socket.send(JSON.stringify({ type: "recording.pause" }));
      await paused;
    }
  }

  async resume() {
    if (this.state !== "paused") return;
    this.state = "recording";
    this.providerReady = false;
    const ready = this.waitForEvent("meeting.ready");
    if (this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify({ type: "recording.resume" }));
    } else {
      this.connect();
    }
    await ready;
  }

  refresh(url: string, ticket: string) {
    this.audioWebsocketUrl = url;
    this.audioTicket = ticket;
    if (this.state === "recording" && (!this.socket || this.socket.readyState >= 2)) {
      this.cancelReconnect();
      this.connect();
    }
  }

  send(samples: Float32Array, source: MeetingCaptureSource = "microphone") {
    if (this.state !== "recording" || !this.activeSources.includes(source)) return;
    const sequence = this.sequences[source]++;
    this.pendingSequences[source] ??= sequence;
    this.pendingSamples[source].push(samples.slice());
    this.pendingSampleCounts[source] += samples.length;
    if (this.pendingSampleCounts[source] < FRAME_SAMPLES * TRANSPORT_BATCH_FRAMES) return;
    this.flushSourceSamples(source);
  }

  private flushSamples() {
    for (const source of this.activeSources) this.flushSourceSamples(source);
  }

  private flushSourceSamples(source: MeetingCaptureSource) {
    const pendingSampleCount = this.pendingSampleCounts[source];
    const pendingSequence = this.pendingSequences[source];
    if (pendingSampleCount === 0 || pendingSequence === null) return;
    const samples = new Float32Array(pendingSampleCount);
    let sampleOffset = 0;
    for (const chunk of this.pendingSamples[source]) {
      samples.set(chunk, sampleOffset);
      sampleOffset += chunk.length;
    }
    const frame = new Uint8Array(9 + samples.length * 2);
    const view = new DataView(frame.buffer);
    view.setBigUint64(0, BigInt(pendingSequence), true);
    view.setUint8(8, meetingAudioSourceCode(source));
    for (let index = 0; index < samples.length; index += 1) {
      view.setInt16(
        9 + index * 2,
        Math.round(Math.max(-1, Math.min(1, samples[index])) * 0x7fff),
        true,
      );
    }
    this.pendingSamples[source] = [];
    this.pendingSampleCounts[source] = 0;
    this.pendingSequences[source] = null;
    this.enqueueFrame(frame);
    this.drainQueue();
  }

  async stop(durationMs: number) {
    if (this.state === "stopped") return;
    if (this.state === "failed") {
      this.state = "stopped";
      this.rejectEventWaiters(new Error("Meeting transcription is unavailable."));
      return;
    }
    this.flushSamples();
    this.cancelReconnect();
    this.cancelReconnectReset();
    if (this.socket?.readyState !== 1 || !this.providerReady) {
      this.state = "recording";
      this.providerReady = false;
      const ready = this.waitForEvent("meeting.ready");
      this.connect();
      try {
        await ready;
      } catch (error) {
        this.state = "stopped";
        this.closeSocket("Meeting stopped");
        throw error;
      }
    }
    this.drainQueue(true);
    this.state = "stopped";
    const completed = this.waitForEvent("recording.flush.completed", 20_000);
    this.socket!.send(JSON.stringify({ durationMs, type: "recording.stop" }));
    try {
      await completed;
    } finally {
      this.closeSocket("Meeting stopped");
    }
  }

  private connect() {
    if (this.state !== "recording") return;
    if (this.socket && this.socket.readyState < 2) return;
    const url = this.dependencies.resolveUrl(this.audioWebsocketUrl);
    const socket = this.dependencies.createSocket(url.toString(), [
      "zilobase.meeting-audio.v2",
      `zilobase.meeting-audio.auth.${this.audioTicket}`,
    ]);
    this.providerReady = false;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      if (this.socket !== socket || this.state !== "recording") {
        socket.close(1000, "Meeting capture inactive");
        return;
      }
      socket.send(
        JSON.stringify({
          sources: this.activeSources,
          type: "recording.configure",
        }),
      );
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.providerReady = false;
      this.cancelReconnectReset();
      if (this.state !== "recording") {
        this.rejectEventWaiters(new Error("Meeting transcription connection closed."));
        return;
      }
      if (event.code === MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE) {
        this.failPermanently(
          "Meeting transcription could not start. Check the configured transcription model and API access; local recording continues.",
        );
        return;
      }
      if (this.reconnectAttempt >= MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS) {
        this.failPermanently(
          "Meeting transcription is unavailable after repeated reconnects; local recording continues.",
        );
        return;
      }
      this.onWarning("Meeting transcription disconnected; local recording continues.");
      const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempt++);
      this.reconnectTimer = this.dependencies.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      const control = parseMeetingAudioEvent(event.data);
      if (control?.type === "meeting.ready") {
        this.acceptProviderReady(socket, control.nextSequences);
        return;
      }
      if (this.handleRecordingControl(control)) return;
      const draft = parseTranscriptDelta(event.data);
      if (draft !== undefined) this.onTranscript(draft);
    };
    socket.onerror = () => {
      if (this.socket !== socket || this.state !== "recording") return;
      socket.close();
    };
    this.socket = socket;
  }

  private acceptProviderReady(socket: WebSocket, nextSequencesValue: unknown) {
    const nextSequences = readNextMeetingAudioSequences(nextSequencesValue);
    if (nextSequences) this.reconcileFrames(nextSequences);
    this.providerReady = true;
    this.resolveEventWaiter("meeting.ready");
    this.cancelReconnectReset();
    this.reconnectResetTimer = this.dependencies.setTimeout(() => {
      this.reconnectResetTimer = null;
      if (this.socket === socket && this.providerReady) {
        this.reconnectAttempt = 0;
      }
    }, TRANSCRIPTION_STABLE_CONNECTION_MS);
    this.drainQueue();
  }

  private handleRecordingControl(control: Record<string, unknown> | null) {
    switch (control?.type) {
      case "recording.paused":
      case "recording.flush.completed":
        this.resolveEventWaiter(control.type);
        return true;
      case "recording.ticket":
        if (typeof control.token !== "string") return false;
        this.audioTicket = control.token;
        return true;
      case "recording.error":
        this.rejectEventWaiters(
          new Error(
            typeof control.message === "string" ? control.message : "Meeting recording failed.",
          ),
        );
        return true;
      default:
        return false;
    }
  }

  private cancelReconnect() {
    if (this.reconnectTimer === null) return;
    this.dependencies.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private cancelReconnectReset() {
    if (this.reconnectResetTimer === null) return;
    this.dependencies.clearTimeout(this.reconnectResetTimer);
    this.reconnectResetTimer = null;
  }

  private closeSocket(reason: string) {
    this.cancelReconnectReset();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < 2) socket.close(1000, reason);
  }

  private failPermanently(message: string) {
    this.state = "failed";
    this.cancelReconnect();
    this.cancelReconnectReset();
    this.pendingSamples = { microphone: [], system: [] };
    this.pendingSampleCounts = { microphone: 0, system: 0 };
    this.pendingSequences = { microphone: null, system: null };
    this.queue = [];
    this.inFlight = [];
    this.rejectEventWaiters(new Error(message));
    this.onTranscript(null);
    this.onWarning(message);
  }

  private enqueueFrame(frame: Uint8Array) {
    this.queue.push(frame);
    if (this.queue.length <= MAX_TRANSPORT_FRAMES) return;
    this.queue.shift();
    this.onWarning("Transcription is falling behind; local recording is still complete.");
  }

  private drainQueue(force = false) {
    const socket = this.socket;
    if (!this.providerReady || socket?.readyState !== 1) return;
    while (this.queue.length > 0 && (force || socket.bufferedAmount < 1_048_576)) {
      const frame = this.queue.shift()!;
      socket.send(Uint8Array.from(frame));
      this.inFlight.push(frame);
      if (this.inFlight.length > MAX_TRANSPORT_FRAMES) this.inFlight.shift();
    }
  }

  private reconcileFrames(nextSequences: Partial<Record<MeetingCaptureSource, number>>) {
    const replay = [...this.inFlight, ...this.queue]
      .map((frame) => {
        const source = meetingAudioFrameSource(frame);
        return source ? trimQueuedMeetingAudioFrame(frame, nextSequences[source] ?? 0) : null;
      })
      .filter((frame): frame is Uint8Array => frame !== null);
    this.inFlight = [];
    this.queue = replay;
    if (this.queue.length <= MAX_TRANSPORT_FRAMES) return;
    this.queue.splice(0, this.queue.length - MAX_TRANSPORT_FRAMES);
    this.onWarning("Transcription replay exceeded its buffer; local recording is still complete.");
  }

  private waitForEvent(type: string, timeoutMs = 15_000) {
    const existing = this.eventWaiters.get(type);
    if (existing) {
      this.dependencies.clearTimeout(existing.timer);
      existing.reject(new Error(`Superseded waiting for ${type}`));
    }
    return new Promise<void>((resolve, reject) => {
      const timer = this.dependencies.setTimeout(() => {
        this.eventWaiters.delete(type);
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);
      this.eventWaiters.set(type, { reject, resolve, timer });
    });
  }

  private resolveEventWaiter(type: string) {
    const waiter = this.eventWaiters.get(type);
    if (!waiter) return;
    this.eventWaiters.delete(type);
    this.dependencies.clearTimeout(waiter.timer);
    waiter.resolve();
  }

  private rejectEventWaiters(reason: Error) {
    for (const waiter of this.eventWaiters.values()) {
      this.dependencies.clearTimeout(waiter.timer);
      waiter.reject(reason);
    }
    this.eventWaiters.clear();
  }
}

function readNextMeetingAudioSequences(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Partial<Record<MeetingCaptureSource, number>> = {};
  for (const [source, sequence] of entries) {
    if ((source !== "microphone" && source !== "system") || !isMeetingAudioSequence(sequence))
      return null;
    result[source] = sequence;
  }
  return entries.length > 0 ? result : null;
}

export function trimQueuedMeetingAudioFrame(frame: Uint8Array, nextSequence: number) {
  if (
    frame.byteLength < 9 + FRAME_SAMPLES * 2 ||
    (frame.byteLength - 9) % (FRAME_SAMPLES * 2) !== 0
  )
    return null;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const sequenceValue = view.getBigUint64(0, true);
  if (sequenceValue > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const sequence = Number(sequenceValue);
  const frameCount = (frame.byteLength - 9) / (FRAME_SAMPLES * 2);
  const endSequence = sequence + frameCount - 1;
  if (endSequence < nextSequence) return null;
  if (sequence >= nextSequence) return frame;

  const skippedFrames = nextSequence - sequence;
  const trimmed = new Uint8Array(9 + (frameCount - skippedFrames) * FRAME_SAMPLES * 2);
  new DataView(trimmed.buffer).setBigUint64(0, BigInt(nextSequence), true);
  trimmed[8] = frame[8];
  trimmed.set(frame.subarray(9 + skippedFrames * FRAME_SAMPLES * 2), 9);
  return trimmed;
}

function meetingAudioSourceCode(source: MeetingCaptureSource) {
  return source === "microphone" ? 0 : 1;
}

function meetingAudioFrameSource(frame: Uint8Array): MeetingCaptureSource | null {
  if (frame.byteLength < 9) return null;
  if (frame[8] === 0) return "microphone";
  if (frame[8] === 1) return "system";
  return null;
}

function parseMeetingAudioEvent(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseTranscriptDelta(
  raw: string,
): Omit<MeetingTranscriptDraft, "meetingId"> | null | undefined {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.type !== "transcript.delta") return undefined;
    if (
      typeof value.itemId !== "string" ||
      (value.source !== "microphone" && value.source !== "system") ||
      typeof value.startMs !== "number" ||
      typeof value.text !== "string" ||
      typeof value.updatedAt !== "number"
    )
      return undefined;
    return {
      itemId: value.itemId,
      source: value.source,
      startMs: value.startMs,
      text: value.text,
      updatedAt: value.updatedAt,
    };
  } catch {
    return undefined;
  }
}

function isMeetingAudioSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
