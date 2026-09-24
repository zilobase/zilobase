export function register({ assert, loadModule, test }) {
  test("custom agent events preserve chunk boundaries, settings order and incomplete-tail behavior", async () => {
    const { readCustomAgentEvents } = await loadModule(
      "/src/features/ai/conversations/adapters/custom-agent-events.ts",
    );
    const encode = new TextEncoder();
    const values = [];
    const bytes = encode.encode(
      'event: settings\ndata: {"scope":"é","status":"editing"}\n\nevent: message\ndata: {}\n\nevent: settings\ndata: {"scope":"é",\ndata: "status":"ready"}\n\nevent: settings\ndata: {"status":"incomplete"}',
    );
    const stream = new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    await readCustomAgentEvents(stream, (event) => values.push(event));
    assert.deepEqual(values, [
      { scope: "é", status: "editing" },
      { scope: "é", status: "ready" },
    ]);
  });
  test("custom agent event parsing propagates server, JSON and transport failures", async () => {
    const { readCustomAgentEvents } = await loadModule(
      "/src/features/ai/conversations/adapters/custom-agent-events.ts",
    );
    const stream = (text) =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    await assert.rejects(
      readCustomAgentEvents(stream('event: error\ndata: {"error":"Denied"}\n\n'), () => {}),
      /Denied/,
    );
    await assert.rejects(
      readCustomAgentEvents(stream("event: settings\ndata: {\n\n"), () => {}),
      SyntaxError,
    );
    await assert.rejects(
      readCustomAgentEvents(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("Canceled transport"));
          },
        }),
        () => {},
      ),
      /Canceled transport/,
    );
    const received = [];
    await readCustomAgentEvents(stream("event: settings\n\n"), (value) => received.push(value));
    assert.deepEqual(received, []);
  });
  test("replayed settings events respect mount time and message/status deduplication", async () => {
    const { replayCustomAgentSettingsEvents } = await loadModule(
      "/src/features/ai/conversations/adapters/custom-agent-events.ts",
    );
    const mountedAt = Date.parse("2026-01-02");
    const seen = new Set();
    const received = [];
    const message = (id, createdAt, status) => ({
      id,
      createdAt,
      parts: [{ type: "data-agent-settings", data: { scope: "agent", status } }],
    });
    const messages = [
      message("old", "2026-01-01", "editing"),
      message("current", "2026-01-02", "editing"),
      message("current", "2026-01-02", "ready"),
      message("bad", "invalid", "ready"),
    ];
    replayCustomAgentSettingsEvents(messages, mountedAt, seen, (event) =>
      received.push(event.status),
    );
    replayCustomAgentSettingsEvents(messages, mountedAt, seen, (event) =>
      received.push(event.status),
    );
    assert.deepEqual(received, ["editing", "ready"]);
    assert.deepEqual([...seen], ["current:editing", "current:ready"]);
  });
}
