import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createMeetingRealtimeTranscriptSink,
  getMeetingOpenAiSafetyIdentifier,
  getMeetingRealtimeTranscriptionConfig,
  getMeetingRealtimeTranscriptionUrl,
  getMeetingTranscriptionFailureCloseCode,
  MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE,
  MeetingRealtimeTranscriptionError,
  MeetingRealtimeTranscriber,
  trimAcceptedMeetingAudio,
  type RealtimeTranscriptionSocket,
  type RealtimeTranscriptionTurn,
} from "./meeting-realtime-transcription";

class FakeRealtimeSocket implements RealtimeTranscriptionSocket {
  closed = false;
  messages: Array<Record<string, unknown>> = [];
  private listeners = new Map<string, Array<(event: never) => void>>();

  addEventListener(type: "close" | "error" | "message", listener: never) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.closed = true;
    this.emit("close", { code: 1000, reason: "closed", wasClean: true });
  }

  emit(type: "close" | "error" | "message", payload: object = {}) {
    const event = type === "message"
      ? { data: JSON.stringify(payload) }
      : payload;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }

  send(data: string) {
    this.messages.push(JSON.parse(data) as Record<string, unknown>);
  }
}

function pcmFrames(frameCount: number, amplitude = 0.2) {
  const pcm = new Uint8Array(960 * frameCount);
  const view = new DataView(pcm.buffer);
  const sample = Math.round(amplitude * 0x7fff);
  for (let offset = 0; offset < pcm.byteLength; offset += 2) {
    view.setInt16(offset, sample, true);
  }
  return pcm;
}

test("realtime transcription streams PCM and promotes deltas to a final turn", async () => {
  const socket = new FakeRealtimeSocket();
  const deltas: RealtimeTranscriptionTurn[] = [];
  const completed: RealtimeTranscriptionTurn[] = [];
  const transcriber = new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted(turn) {
      completed.push(turn);
    },
    onDelta(turn) {
      deltas.push(turn);
    },
  });

  transcriber.appendAudio(pcmFrames(5), 10);
  socket.emit("message", {
    delta: "Hello ",
    item_id: "item-1",
    type: "conversation.item.input_audio_transcription.delta",
  });
  socket.emit("message", {
    delta: "team",
    item_id: "item-1",
    type: "conversation.item.input_audio_transcription.delta",
  });
  transcriber.appendAudio(pcmFrames(25, 0), 15);
  socket.emit("message", {
    item_id: "item-1",
    type: "input_audio_buffer.committed",
  });
  const finishing = transcriber.finish();
  socket.emit("message", {
    item_id: "item-1",
    transcript: "Hello team",
    type: "conversation.item.input_audio_transcription.completed",
  });
  await finishing;

  assert.equal(socket.messages[0]?.type, "session.update");
  assert.deepEqual(socket.messages[0]?.session, {
    audio: {
      input: {
        format: { rate: 24_000, type: "audio/pcm" },
        transcription: { delay: "minimal", model: "gpt-live-transcribe" },
        turn_detection: null,
      },
    },
    type: "transcription",
  });
  assert.equal(socket.messages[1]?.type, "input_audio_buffer.append");
  assert.equal(
    socket.messages.some((message) => message.type === "input_audio_buffer.commit"),
    true,
  );
  assert.deepEqual(deltas.map((turn) => turn.text), ["Hello ", "Hello team"]);
  assert.deepEqual(completed, [{
    endSequence: 14,
    itemId: "item-1",
    startSequence: 10,
    text: "Hello team",
  }]);
  assert.equal(socket.closed, true);
});

test("realtime transcription uses a dedicated live model and trims secrets", () => {
  assert.deepEqual(getMeetingRealtimeTranscriptionConfig({
    OPENAI_API_KEY: "  key\n",
    OPENAI_REALTIME_TRANSCRIPTION_MODEL: " custom-live ",
  }), {
    apiKey: "key",
    model: "custom-live",
  });
  assert.equal(
    getMeetingRealtimeTranscriptionConfig({ OPENAI_API_KEY: "key" }).model,
    "gpt-live-transcribe",
  );
});

test("meeting audio replay trims only the already accepted part of a batch", () => {
  const pcm = Uint8Array.from({ length: 960 * 5 }, (_, index) => index % 251);
  const accepted = trimAcceptedMeetingAudio(pcm, 20, 21);

  assert.equal(accepted?.sequence, 22);
  assert.equal(accepted?.endSequence, 24);
  assert.deepEqual(accepted?.pcm, pcm.subarray(960 * 2));
  assert.equal(trimAcceptedMeetingAudio(pcm, 20, 24), null);
});

test("OpenAI safety identifiers are stable and do not expose internal user IDs", async () => {
  const first = await getMeetingOpenAiSafetyIdentifier("user-private-123");
  const second = await getMeetingOpenAiSafetyIdentifier("user-private-123");

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(first, /user-private-123/);
});

test("cost-oriented realtime transcription omits unsupported live delay", () => {
  const socket = new FakeRealtimeSocket();
  new MeetingRealtimeTranscriber(socket, "gpt-4o-mini-transcribe", {
    onCompleted() {},
    onDelta() {},
  });

  assert.deepEqual(socket.messages[0]?.session, {
    audio: {
      input: {
        format: { rate: 24_000, type: "audio/pcm" },
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: null,
      },
    },
    type: "transcription",
  });
});

test("realtime transcription keeps continuous speech in one live turn", () => {
  const socket = new FakeRealtimeSocket();
  const transcriber = new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted() {},
    onDelta() {},
  });

  for (let sequence = 0; sequence < 150; sequence += 5) {
    transcriber.appendAudio(pcmFrames(5), sequence);
  }

  assert.equal(
    socket.messages.filter((message) => message.type === "input_audio_buffer.commit").length,
    0,
  );
});

test("realtime transcription bounds continuous speech turns", () => {
  const socket = new FakeRealtimeSocket();
  const transcriber = new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted() {},
    onDelta() {},
  });

  for (let sequence = 0; sequence < 1_500; sequence += 5) {
    transcriber.appendAudio(pcmFrames(5), sequence);
  }

  assert.equal(
    socket.messages.filter((message) => message.type === "input_audio_buffer.commit").length,
    1,
  );
});

test("realtime transcription clears prolonged leading silence", () => {
  const socket = new FakeRealtimeSocket();
  const transcriber = new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted() {},
    onDelta() {},
  });

  for (let sequence = 0; sequence < 250; sequence += 5) {
    transcriber.appendAudio(pcmFrames(5, 0), sequence);
  }

  assert.equal(
    socket.messages.filter((message) => message.type === "input_audio_buffer.clear").length,
    1,
  );
  assert.equal(
    socket.messages.filter((message) => message.type === "input_audio_buffer.commit").length,
    0,
  );
});

test("the Node transcript sink publishes every provider delta immediately", () => {
  const published: RealtimeTranscriptionTurn[] = [];
  const sink = createMeetingRealtimeTranscriptSink(
    {} as never,
    {} as never,
    (turn) => published.push(turn),
  );
  const turn = {
    endSequence: 4,
    itemId: "item-live",
    startSequence: 0,
  };

  sink.onDelta({ ...turn, text: "Hello" });
  sink.onDelta({ ...turn, text: "Hello live" });

  assert.deepEqual(published.map((draft) => draft.text), ["Hello", "Hello live"]);
});

test("finishing manually commits and waits for an unfinished speech turn", async () => {
  const socket = new FakeRealtimeSocket();
  const completed: RealtimeTranscriptionTurn[] = [];
  const transcriber = new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted(turn) {
      completed.push(turn);
    },
    onDelta() {},
  });

  transcriber.appendAudio(pcmFrames(5), 40);
  const finishing = transcriber.finish();

  assert.equal(socket.messages.at(-1)?.type, "input_audio_buffer.commit");
  assert.equal(socket.closed, false);

  socket.emit("message", {
    item_id: "item-tail",
    type: "input_audio_buffer.committed",
  });
  socket.emit("message", {
    item_id: "item-tail",
    transcript: "Last words",
    type: "conversation.item.input_audio_transcription.completed",
  });
  await finishing;

  assert.deepEqual(completed, [{
    endSequence: 44,
    itemId: "item-tail",
    startSequence: 40,
    text: "Last words",
  }]);
  assert.equal(socket.closed, true);
});

test("application silence detection commits a live transcription turn", async () => {
  const socket = new FakeRealtimeSocket();
  const completed: RealtimeTranscriptionTurn[] = [];
  const transcriber = new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted(turn) {
      completed.push(turn);
    },
    onDelta() {},
  });

  transcriber.appendAudio(pcmFrames(5), 60);
  socket.emit("message", {
    delta: "Natural pause",
    item_id: "item-vad",
    type: "conversation.item.input_audio_transcription.delta",
  });
  transcriber.appendAudio(pcmFrames(25, 0), 65);
  const finishing = transcriber.finish();

  assert.equal(
    socket.messages.some((message) => message.type === "input_audio_buffer.commit"),
    true,
  );
  assert.equal(socket.closed, false);

  socket.emit("message", {
    item_id: "item-vad",
    type: "input_audio_buffer.committed",
  });
  socket.emit("message", {
    item_id: "item-vad",
    transcript: "Natural pause",
    type: "conversation.item.input_audio_transcription.completed",
  });
  await finishing;

  assert.equal(completed[0]?.text, "Natural pause");
  assert.equal(socket.closed, true);
});

test("completed application-detected turns are delivered in speech order", async () => {
  const socket = new FakeRealtimeSocket();
  const completed: RealtimeTranscriptionTurn[] = [];
  const transcriber = new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted(turn) {
      completed.push(turn);
    },
    onDelta() {},
  });

  for (const [itemId, sequence] of [
    ["item-1", 0],
    ["item-2", 35],
  ] as const) {
    transcriber.appendAudio(pcmFrames(10), sequence);
    socket.emit("message", {
      delta: itemId,
      item_id: itemId,
      type: "conversation.item.input_audio_transcription.delta",
    });
    transcriber.appendAudio(pcmFrames(25, 0), sequence + 10);
    socket.emit("message", {
      item_id: itemId,
      type: "input_audio_buffer.committed",
    });
  }

  socket.emit("message", {
    item_id: "item-2",
    transcript: "Second",
    type: "conversation.item.input_audio_transcription.completed",
  });
  await Promise.resolve();
  assert.equal(completed.length, 0);

  socket.emit("message", {
    item_id: "item-1",
    transcript: "First",
    type: "conversation.item.input_audio_transcription.completed",
  });
  await transcriber.finish();

  assert.deepEqual(completed.map((turn) => turn.text), ["First", "Second"]);
});

test("realtime transcription selects transcription intent at connection time", () => {
  assert.equal(
    getMeetingRealtimeTranscriptionUrl("wss"),
    "wss://api.openai.com/v1/realtime?intent=transcription",
  );
  assert.equal(
    getMeetingRealtimeTranscriptionUrl("https"),
    "https://api.openai.com/v1/realtime?intent=transcription",
  );
});

test("invalid provider configuration is marked as a permanent audio failure", () => {
  const socket = new FakeRealtimeSocket();
  let failure: Error | undefined;
  new MeetingRealtimeTranscriber(socket, "bad-model", {
    onCompleted() {},
    onDelta() {},
    onError(error) {
      failure = error;
    },
  });

  socket.emit("message", {
    error: {
      code: "invalid_model",
      message: "Unsupported model\nfor this session",
      param: "session.audio.input.transcription.model",
      type: "invalid_request_error",
    },
    type: "error",
  });

  assert.ok(failure instanceof MeetingRealtimeTranscriptionError);
  assert.equal(
    failure.message,
    "Realtime transcription provider error (invalid_model) at session.audio.input.transcription.model: Unsupported model for this session",
  );
  assert.equal(getMeetingTranscriptionFailureCloseCode(failure), 4400);
  assert.equal(MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE, 4400);
});

test("provider close metadata preserves permanent OpenAI failures", () => {
  const socket = new FakeRealtimeSocket();
  let failure: Error | undefined;
  new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted() {},
    onDelta() {},
    onError(error) {
      failure = error;
    },
  });

  socket.emit("close", {
    code: 3000,
    reason: "invalid_request_error.invalid_api_key",
    wasClean: true,
  });

  assert.ok(failure instanceof MeetingRealtimeTranscriptionError);
  assert.match(failure.message, /invalid_api_key/);
  assert.match(failure.message, /code 3000/);
  assert.equal(getMeetingTranscriptionFailureCloseCode(failure), 4400);
});

test("an active provider connection closing cleanly is still a retryable failure", () => {
  const socket = new FakeRealtimeSocket();
  let failure: Error | undefined;
  new MeetingRealtimeTranscriber(socket, "gpt-live-transcribe", {
    onCompleted() {},
    onDelta() {},
    onError(error) {
      failure = error;
    },
  });
  socket.emit("message", { type: "session.updated" });
  socket.emit("close", { code: 1000, reason: "provider restart", wasClean: true });

  assert.match(failure?.message ?? "", /code 1000/);
  assert.equal(getMeetingTranscriptionFailureCloseCode(failure), 1011);
});
