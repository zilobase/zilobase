import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeChatStream } from "./stream";

for (const name of ["search_workspace", "semantic_search_workspace"] as const)
  test(`live workspace search progress preserves its query without a source association (${name})`, async () => {
    const event = {
      type: "read-progress",
      context: {
        version: 1,
        status: "complete",
        markdown: "",
        charCount: 0,
        manifest: [],
        omissions: [],
        trimmedAttachmentIds: [],
      },
      progress: {
        activities: [
          {
            id: "search",
            name,
            label: "Searching workspace",
            query: "launch",
            status: "completed",
            returned: 2,
          },
        ],
        canContinue: false,
      },
    };
    const events: unknown[] = [];
    await consumeChatStream(
      new Response(JSON.stringify(event) + '\n{"type":"done","status":"completed"}\n'),
      new AbortController().signal,
      (value) => events.push(value),
    );
    assert.deepEqual(events[0], event);
  });

test("stream handles split UTF-8 frames and detects interrupted responses", async () => {
  const bytes = new TextEncoder().encode(
    '{"type":"delta","text":"हाय"}\n{"type":"done","status":"completed"}\n',
  );
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    }),
  );
  const events: unknown[] = [];
  await consumeChatStream(response, new AbortController().signal, (event) => events.push(event));
  assert.deepEqual(events[0], { type: "delta", text: "हाय" });
  await assert.rejects(
    consumeChatStream(
      new Response('{"type":"delta","text":"partial"}\n'),
      new AbortController().signal,
      () => {},
    ),
    /interrupted/,
  );
});

test("stop cancels a stalled body read without waiting for another provider chunk", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const reading = consumeChatStream(response, controller.signal, () => {});
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("provider errors keep prior deltas and reject with a useful retry error", async () => {
  const events: unknown[] = [];
  await assert.rejects(
    consumeChatStream(
      new Response(
        '{"type":"delta","text":"partial"}\n{"type":"error","message":"Retry your message"}\n',
      ),
      new AbortController().signal,
      (event) => events.push(event),
    ),
    /Retry/,
  );
  assert.equal(events.length, 2);
});

test("live debug events preserve raw tool payloads separately from progress and reject malformed events", async () => {
  const event = {
    type: "debug",
    omitted: 0,
    events: [
      {
        id: 1,
        at: "2026-10-21T00:00:00.000Z",
        step: 1,
        type: "tool.result",
        tool: "read_page",
        toolCallId: "read",
        payload: JSON.stringify({ text: "Actual source data" }),
      },
    ],
  };
  const events: unknown[] = [];
  await consumeChatStream(
    new Response(JSON.stringify(event) + '\n{"type":"done","status":"completed"}\n'),
    new AbortController().signal,
    (event) => events.push(event),
  );
  assert.deepEqual(events[0], event);
  await assert.rejects(
    consumeChatStream(
      new Response('{"type":"debug","events":[{}],"omitted":0}\n'),
      new AbortController().signal,
      () => {},
    ),
  );
});
