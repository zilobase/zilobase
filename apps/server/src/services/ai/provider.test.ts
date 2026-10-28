import { expect, test, vi } from "vitest";
import { generateChatOutput, type ProviderChunk } from "./provider";
import type { ServerOperationContext } from "../operations/context";
const context = {
  env: { AI_PROVIDER_BACKGROUND_ENABLED: "true", OPENAI_API_KEY: "test" },
} as unknown as ServerOperationContext;
const input = {
  model: "accepted-model",
  messages: [{ role: "user" as const, content: "Hello" }],
  maxOutputTokens: 100,
};
const encode = (events: unknown[], ending = "\n") =>
  new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}${ending}${ending}`).join(""),
  );
function events(text = "हाय") {
  const response = { id: "resp_created", created_at: 1792454400, model: "accepted-model" };
  const item = { type: "message", id: "msg_1" };
  return [
    { type: "response.created", sequence_number: 0, response },
    { type: "response.in_progress", sequence_number: 1, response },
    { type: "response.output_item.added", sequence_number: 2, output_index: 0, item },
    {
      type: "response.output_text.delta",
      sequence_number: 3,
      item_id: item.id,
      output_index: 0,
      delta: text,
    },
    { type: "response.output_item.done", sequence_number: 4, output_index: 0, item },
    {
      type: "response.completed",
      sequence_number: 5,
      response: { ...response, usage: { input_tokens: 20, output_tokens: 3 } },
    },
  ];
}
async function collect(stream: AsyncIterable<ProviderChunk>) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
function response(frames: unknown[], splitBytes = false) {
  const bytes = encode(frames, splitBytes ? "\r\n" : "\n");
  return new Response(
    splitBytes
      ? new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
            controller.close();
          },
        })
      : bytes,
    { headers: { "content-type": "text/event-stream" } },
  );
}

test("background streamText preserves the accepted model and handles split UTF-8 and CRLF frames", async () => {
  const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "accepted-model",
      background: true,
      stream: true,
      store: false,
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("max_output_tokens");
    return response(events(), true);
  });
  const chunks = await collect(
    generateChatOutput(context, input, new AbortController().signal, {}, transport as typeof fetch),
  );
  expect(chunks.filter((chunk) => chunk.text).map((chunk) => chunk.text)).toEqual(["हाय"]);
  expect(chunks.at(-1)).toEqual({
    responseId: "resp_created",
    cursor: 5,
    completed: true,
    usage: { inputTokens: 20, outputTokens: 3 },
  });
  expect(transport).toHaveBeenCalledTimes(1);
});

test("SDK text and its provider cursor are emitted together; the terminal cursor only accompanies completion", async () => {
  const chunks = await collect(
    generateChatOutput(context, input, new AbortController().signal, {}, (async () =>
      response(events())) as typeof fetch),
  );
  expect(chunks.filter((chunk) => chunk.cursor === 3)).toEqual([
    { responseId: "resp_created", cursor: 3, text: "हाय" },
  ]);
  expect(chunks.filter((chunk) => chunk.cursor === 5)).toHaveLength(1);
  expect(chunks.find((chunk) => chunk.cursor === 5)?.completed).toBe(true);
  expect(chunks[0]).toEqual({ responseId: "resp_created", cursor: 0 });
});

test("foreground generation uses the SDK stream without enabling provider background mode", async () => {
  const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body.background).toBeUndefined();
    expect(body.model).toBe("accepted-model");
    return response(events("SDK answer"));
  });
  const chunks = await collect(
    generateChatOutput(
      { ...context, env: { OPENAI_API_KEY: "test" } },
      input,
      new AbortController().signal,
      {},
      transport as typeof fetch,
    ),
  );
  expect(chunks).toEqual([
    { text: "SDK answer" },
    { completed: true, usage: { inputTokens: 20, outputTokens: 3 } },
  ]);
});

test("a broken background stream keeps checkpointable text without reporting completion", async () => {
  const chunks: ProviderChunk[] = [];
  await expect(
    (async () => {
      for await (const chunk of generateChatOutput(
        context,
        input,
        new AbortController().signal,
        {},
        (async () => response(events().slice(0, 4))) as typeof fetch,
      ))
        chunks.push(chunk);
    })(),
  ).rejects.toThrow("INTERRUPTED");
  expect(chunks.find((chunk) => chunk.text)?.text).toBe("हाय");
  expect(chunks.some((chunk) => chunk.completed)).toBe(false);
});

test("SDK provider failures never retry a potentially paid creation", async () => {
  const transport = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: "Unavailable", type: "server_error" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
  );
  await expect(
    collect(
      generateChatOutput(
        context,
        input,
        new AbortController().signal,
        {},
        transport as typeof fetch,
      ),
    ),
  ).rejects.toThrow("CHAT_PROVIDER_FAILED");
  expect(transport).toHaveBeenCalledTimes(1);
});

test("abort interrupts a stalled SDK stream without requiring another provider chunk", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const transport = async () =>
    new Response(
      new ReadableStream({
        start(body) {
          body.enqueue(encode(events().slice(0, 2)));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  await expect(
    (async () => {
      for await (const _chunk of generateChatOutput(
        context,
        input,
        controller.signal,
        {},
        transport as typeof fetch,
      ))
        controller.abort();
    })(),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(cancelled).toBe(true);
});

test("provider recovery retrieves the original response cursor and ignores repeated events without another SDK POST", async () => {
  const frames = [
    { type: "response.output_text.delta", sequence_number: 4, delta: "duplicate" },
    { type: "response.output_text.delta", sequence_number: 5, delta: " suffix" },
    {
      type: "response.completed",
      sequence_number: 6,
      response: { id: "resp_1", usage: { output_tokens: 7 } },
    },
  ];
  const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe("GET");
    return response(frames);
  });
  const chunks = await collect(
    generateChatOutput(
      context,
      input,
      new AbortController().signal,
      { responseId: "resp_1", cursor: 4 },
      transport as typeof fetch,
    ),
  );
  expect(transport.mock.calls[0]?.[0]).toContain("resp_1?stream=true&starting_after=4");
  expect(chunks.filter((chunk) => chunk.text).map((chunk) => chunk.text)).toEqual([" suffix"]);
  expect(chunks.at(-1)?.completed).toBe(true);
  expect(transport).toHaveBeenCalledTimes(1);
});
