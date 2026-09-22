function observedState() {
  const state = {
    level: 0,
    devices: [],
    status: null,
    liveTranscripts: undefined,
    recovery: null,
  };
  const observer = Object.fromEntries(
    Object.keys(state).map((key) => [
      `set${key[0].toUpperCase()}${key.slice(1)}`,
      (value) => {
        state[key] = typeof value === "function" ? value(state[key]) : value;
      },
    ]),
  );
  return { state, observer };
}
const settled = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

export function register({ assert, loadModule, test }) {
  test("native capture scopes events, deduplicates warnings and clears stopped transcripts", async () => {
    const { createNativeMeetingCaptureRuntime } = await loadModule(
      "/src/features/desktop/meetings/native-capture-runtime.ts",
    );
    const handlers = new Map(), removed = [], calls = [];
    const runtime = createNativeMeetingCaptureRuntime({
      state: async () => ({ meetingId: "meeting", phase: "recording" }),
      listDevices: async () => [{ id: "mic" }],
      recoverable: async () => [
            { meetingId: "other" },
            { meetingId: "meeting", audioPath: "local" },
          ],
      refreshTransport: async (...args) => { calls.push(["refresh", args]); },
      deleteLocal: async (meetingId) => { calls.push(["delete", meetingId]); },
      onState: (callback) => {
        const name = "meeting-capture-state";
        handlers.set(name, callback);
        return () => removed.push(name);
      },
      onLevel: (callback) => {
        const name = "meeting-capture-level";
        handlers.set(name, callback);
        return () => removed.push(name);
      },
      onWarning: (callback) => {
        const name = "meeting-capture-warning";
        handlers.set(name, callback);
        return () => removed.push(name);
      },
      onTranscript: (callback) => {
        const name = "meeting-capture-transcript";
        handlers.set(name, callback);
        return () => removed.push(name);
      },
    });
    const { state, observer } = observedState();
    const dispose = runtime.observe("meeting", observer);
    await settled();
    assert.equal(state.status.meetingId, "meeting");
    assert.deepEqual(state.devices, [{ id: "mic" }]);
    assert.equal(state.recovery.audioPath, "local");
    const emit = (name, payload) => handlers.get(name)(payload);
    emit("meeting-capture-state", { meetingId: "other", phase: "paused" });
    assert.equal(state.status.phase, "recording");
    emit("meeting-capture-warning", { message: "Device interrupted" });
    emit("meeting-capture-warning", { message: "Device interrupted" });
    assert.deepEqual(state.status.warnings, ["Device interrupted"]);
    emit("meeting-capture-level", { rms: 0.8, peak: 0.5 });
    assert.equal(state.level, 1);
    emit("meeting-capture-transcript", {
      meetingId: "other",
      source: "microphone",
      text: "Ignore",
    });
    assert.equal(state.liveTranscripts, undefined);
    emit("meeting-capture-transcript", {
      meetingId: "meeting",
      source: "microphone",
      text: "First",
    });
    emit("meeting-capture-transcript", {
      meetingId: "meeting",
      source: "microphone",
      text: "Replacement",
    });
    assert.equal(state.liveTranscripts.length, 1);
    assert.equal(state.liveTranscripts[0].text, "Replacement");
    emit("meeting-capture-state", { meetingId: "meeting", phase: "stopped" });
    assert.deepEqual(state.liveTranscripts, []);
    await runtime.refreshTransport("wss://capture.test", "ticket");
    assert.deepEqual(calls.at(-1), ["refresh", ["wss://capture.test", "ticket"]]);
    await runtime.deleteLocalFile("meeting");
    assert.deepEqual(calls.at(-1), ["delete", "meeting"]);
    dispose();
    assert.equal(removed.length, 4);
  });

  test("native capture discards async results after disposal", async () => {
    const { createNativeMeetingCaptureRuntime } = await loadModule(
      "/src/features/desktop/meetings/native-capture-runtime.ts",
    );
    const resolvers = [], removed = [];
    const pending = () => new Promise((resolve) => resolvers.push(resolve));
    const runtime = createNativeMeetingCaptureRuntime({
      state: pending,
      listDevices: pending,
      recoverable: pending,
      onState: () => () => removed.push("state"),
      onLevel: () => () => removed.push("level"),
      onWarning: () => () => removed.push("warning"),
      onTranscript: () => () => removed.push("transcript"),
    });
    const { state, observer } = observedState();
    runtime.observe("meeting", observer)();
    resolvers[0]({ meetingId: "meeting" });
    resolvers[1]([{ id: "mic" }]);
    resolvers[2]([{ meetingId: "meeting" }]);
    await settled();
    assert.equal(state.status, null);
    assert.deepEqual(state.devices, []);
    assert.equal(removed.length, 4);
  });

  test("browser capture filters snapshots and stops observing without closing the recorder", async () => {
    const { createBrowserMeetingCaptureRuntime } = await loadModule(
      "/src/features/meetings/capture/browser-capture-runtime.ts",
    );
    let notify,
      unlistened = false,
      stopped = false;
    const capture = {
      level: 0.5,
      status: { meetingId: "other" },
      recovery: { meetingId: "meeting" },
      liveTranscripts: [
        { meetingId: "meeting", text: "Mine" },
        { meetingId: "other", text: "Other" },
      ],
      subscribe: (callback) => {
        notify = callback;
        return () => {
          unlistened = true;
        };
      },
      listDevices: async () => [{ id: "browser-mic" }],
      loadRecovery: async () => {},
      stop: async () => {
        stopped = true;
      },
    };
    const { state, observer } = observedState();
    const dispose = createBrowserMeetingCaptureRuntime(capture).observe(
      "meeting",
      observer,
    );
    await settled();
    assert.equal(state.status, null);
    assert.equal(state.liveTranscripts.length, 1);
    assert.equal(state.recovery.meetingId, "meeting");
    dispose();
    capture.level = 0.9;
    notify();
    assert.equal(state.level, 0.5);
    assert.equal(unlistened, true);
    assert.equal(stopped, false);
  });
}
