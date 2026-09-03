import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { createServer, type Server } from "node:http";
import WebSocket from "ws";
import { afterEach, test, vi } from "vitest";

type TranscriptTurn = {
  endSequence: number;
  itemId: string;
  startSequence: number;
  text: string;
};

const meetingService = vi.hoisted(() => ({
  heartbeatMeetingRecorder: vi.fn(async () => undefined),
  transitionMeeting: vi.fn(async (_input: Record<string, unknown>) => undefined),
  validateMeetingRecorderLease: vi.fn(async () => undefined),
}));

const transcriptSink = vi.hoisted(() => ({
  onCompleted: vi.fn(async (_turn: TranscriptTurn) => undefined),
  onDelta: vi.fn((_turn: TranscriptTurn) => undefined),
}));

vi.mock("../../features/meetings/meeting-service", () => ({
  ...meetingService,
  MEETING_RECORDER_LEASE_HEARTBEAT_MS: 30_000,
}));

vi.mock("../../infrastructure/database", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../infrastructure/database")>();
  return {
    ...original,
    runWithDbEnv: vi.fn(async (_env, task: () => unknown) => task()),
  };
});

vi.mock("../../features/meetings/meeting-realtime-transcription", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../features/meetings/meeting-realtime-transcription")>();
  return {
    ...original,
    createMeetingRealtimeTranscriptSink: vi.fn((_env, _claims, publishDelta) => ({
      onCompleted: transcriptSink.onCompleted,
      onDelta: (turn: Parameters<typeof transcriptSink.onDelta>[0]) => {
        transcriptSink.onDelta(turn);
        publishDelta(turn);
      },
    })),
  };
});

import {
  createMeetingAudioTicket,
  MEETING_AUDIO_AUTH_PROTOCOL_PREFIX,
  MEETING_AUDIO_PROTOCOL,
  type MeetingAudioTicketClaims,
} from "../../features/meetings/meeting-audio-ticket";
import type {
  MeetingRealtimeTranscriber,
  MeetingRealtimeTranscriberCallbacks,
} from "../../features/meetings/meeting-realtime-transcription";
import { attachNodeMeetingAudioRuntime } from "./meeting-audio-runtime";

const env = { COLLABORATION_SECRET: "meeting-audio-runtime-test-secret" };
const openSockets = new Set<WebSocket>();

afterEach(() => {
  for (const socket of openSockets) socket.close();
  openSockets.clear();
  vi.clearAllMocks();
});

test("meeting audio authenticates the upgrade and preserves its public protocol", async () => {
  const fixture = await startFixture();
  try {
    assert.equal(await requestUpgradeStatus(fixture.url), 401);
    const wrongMeeting = await ticket({ meetingId: "meeting-2" });
    assert.equal(await requestUpgradeStatus(fixture.url, wrongMeeting), 403);

    const client = await openClient(fixture.url, await ticket());
    assert.equal(client.protocol, MEETING_AUDIO_PROTOCOL);
    assert.equal(meetingService.validateMeetingRecorderLease.mock.calls.length, 1);
  } finally {
    await fixture.close();
  }
});

test("meeting audio streams, pauses, resumes, and flushes a recording", async () => {
  const fixture = await startFixture();
  const client = await openClient(fixture.url, await ticket());

  try {
    client.send(JSON.stringify({ sources: ["microphone"], type: "recording.configure" }));
    const ready = await nextMessage(client, "meeting.ready");
    assert.deepEqual(ready.nextSequences, { microphone: 0 });

    client.send(audioPacket(0, 0));
    await waitFor(() => fixture.transcribers[0]?.appendAudio.mock.calls.length === 1);
    assert.equal(fixture.transcribers[0]?.appendAudio.mock.calls[0]?.[1], 0);

    const callbacks = fixture.callbacks[0]!;
    const deltaMessage = nextMessage(client, "transcript.delta");
    callbacks.onDelta({ endSequence: 0, itemId: "item-1", startSequence: 0, text: "Hel" });
    const delta = await deltaMessage;
    assert.equal(delta.itemId, "microphone:item-1");
    assert.equal(delta.source, "microphone");
    await callbacks.onCompleted({ endSequence: 0, itemId: "item-1", startSequence: 0, text: "Hello" });
    assert.equal(transcriptSink.onCompleted.mock.calls[0]?.[0].itemId, "microphone:item-1");

    client.send(JSON.stringify({ type: "recording.pause" }));
    await nextMessage(client, "recording.paused");
    assert.equal(fixture.transcribers[0]?.finish.mock.calls.length, 1);

    client.send(JSON.stringify({ type: "recording.resume" }));
    await nextMessage(client, "meeting.ready");
    assert.equal(fixture.transcribers.length, 2);

    client.send(JSON.stringify({ durationMs: 1_234.6, type: "recording.stop" }));
    const completed = await nextMessage(client, "recording.flush.completed");
    assert.equal(completed.durationMs, 1_235);
    assert.equal(completed.segmentCount, 1);
    assert.deepEqual(meetingService.transitionMeeting.mock.calls[0]?.[0], {
      action: "stop",
      durationMs: 1_235,
      env,
      leaseId: "lease-1",
      meetingId: "meeting-1",
      userId: "user-1",
    });
  } finally {
    await fixture.close();
  }
});

test("meeting audio closes malformed controls, sources, frames, and duplicate recorders", async () => {
  const fixture = await startFixture();
  try {
    const malformed = await openClient(fixture.url, await ticket({ leaseId: "malformed" }));
    malformed.send("not-json");
    assert.deepEqual(await closed(malformed), { code: 1003, reason: "Invalid meeting audio control message" });

    const invalidSources = await openClient(fixture.url, await ticket({ leaseId: "sources" }));
    invalidSources.send(JSON.stringify({ sources: ["microphone", "microphone"], type: "recording.configure" }));
    assert.deepEqual(await closed(invalidSources), { code: 1008, reason: "Invalid meeting audio sources" });

    const invalidFrame = await openClient(fixture.url, await ticket({ leaseId: "frame" }));
    invalidFrame.send(JSON.stringify({ sources: ["microphone"], type: "recording.configure" }));
    await nextMessage(invalidFrame, "meeting.ready");
    invalidFrame.send(Buffer.alloc(10));
    assert.deepEqual(await closed(invalidFrame), { code: 1009, reason: "Invalid meeting audio frame" });

    const first = await openClient(fixture.url, await ticket({ leaseId: "reconnect" }));
    const firstClosed = closed(first);
    await openClient(fixture.url, await ticket({ leaseId: "reconnect" }));
    assert.deepEqual(await firstClosed, { code: 1008, reason: "Recorder reconnected" });
  } finally {
    await fixture.close();
  }
});

async function startFixture() {
  const callbacks: MeetingRealtimeTranscriberCallbacks[] = [];
  const transcribers: TestTranscriber[] = [];
  const server = createServer((_request, response) => response.end());
  const runtime = attachNodeMeetingAudioRuntime(server, env, {
    connect: async (_runtimeEnv, nextCallbacks) => {
      callbacks.push(nextCallbacks);
      const transcriber = new TestTranscriber();
      transcribers.push(transcriber);
      queueMicrotask(() => nextCallbacks.onReady?.());
      return transcriber as unknown as MeetingRealtimeTranscriber;
    },
  });
  await listen(server);
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    callbacks,
    close: async () => {
      await runtime.destroy();
      await closeServer(server);
    },
    transcribers,
    url: `ws://127.0.0.1:${address.port}/meeting-audio?meeting=meeting-1`,
  };
}

class TestTranscriber {
  readonly appendAudio = vi.fn((_pcm: Uint8Array, _sequence: number) => undefined);
  readonly finish = vi.fn(async () => undefined);
}

async function ticket(overrides: Partial<Omit<MeetingAudioTicketClaims, "exp">> = {}) {
  return (await createMeetingAudioTicket({
    leaseId: "lease-1",
    meetingId: "meeting-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    ...overrides,
  }, env)).token;
}

function audioPacket(sequence: number, sourceCode: number) {
  const frame = Buffer.alloc(9 + 960);
  frame.writeBigUInt64LE(BigInt(sequence), 0);
  frame[8] = sourceCode;
  return frame;
}

async function openClient(url: string, audioTicket: string) {
  const socket = new WebSocket(url, [
    MEETING_AUDIO_PROTOCOL,
    `${MEETING_AUDIO_AUTH_PROTOCOL_PREFIX}${audioTicket}`,
  ]);
  openSockets.add(socket);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket upgrade failed")), { once: true });
  });
  return socket;
}

function nextMessage(socket: WebSocket, type: string) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 1_000);
    const listener = (event: WebSocket.MessageEvent) => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      resolve(message);
    };
    socket.addEventListener("message", listener);
  });
}

function closed(socket: WebSocket) {
  return new Promise<{ code: number; reason: string }>((resolve) => {
    socket.addEventListener("close", (event) => {
      resolve({ code: event.code, reason: event.reason });
    }, { once: true });
  });
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function listen(server: Server) {
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function requestUpgradeStatus(url: string, audioTicket?: string) {
  const target = new URL(url);
  return new Promise<number>((resolve, reject) => {
    const socket = createConnection(Number(target.port), target.hostname);
    let response = "";
    socket.once("connect", () => {
      const protocol = audioTicket
        ? `Sec-WebSocket-Protocol: ${MEETING_AUDIO_PROTOCOL}, ${MEETING_AUDIO_AUTH_PROTOCOL_PREFIX}${audioTicket}\r\n`
        : "";
      socket.write(
        `GET ${target.pathname}${target.search} HTTP/1.1\r\n` +
          `Host: ${target.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n" +
          protocol + "\r\n",
      );
    });
    socket.on("data", (chunk) => {
      response += chunk.toString();
      const match = response.match(/^HTTP\/1\.1 (\d{3})/);
      if (match) {
        socket.destroy();
        resolve(Number(match[1]));
      }
    });
    socket.once("error", reject);
  });
}
