import { expect, test, vi } from "vitest";
vi.mock("./intent", async (original) => ({
  ...(await original<typeof import("./intent")>()),
  routeSearchIntent: async () => ({
    intent: { mode: "read", keywordQuery: null, teamspaceNames: [] },
    usage: {},
  }),
}));
vi.mock("./conversations", async (original) => ({
  ...(await original<typeof import("./conversations")>()),
  persistChatMemory: vi.fn(async () => {}),
}));
vi.mock("../operations/context", async (original) => ({
  ...(await original<typeof import("../operations/context")>()),
  runServerOperation: async (_context: unknown, run: () => Promise<unknown>) => run(),
}));
import { MockLanguageModelV4 } from "ai/test";
import { configuredChatModel, DEFAULT_CHAT_MODEL, prepareChat } from "./chat";
import type { ServerOperationContext } from "../operations/context";
import type { ChatRequest } from "@zilobase/features/runtime";

const request: ChatRequest = {
  workspaceId: "workspace",
  requestId: "11111111-1111-4111-8111-111111111111",
  text: "What is due?",
  roots: [],
  snapshots: [],
  history: [],
};
const context = { env: {} } as ServerOperationContext;

test("chat uses the default model with an existing API key and honors model overrides", () => {
  const env = { OPENAI_API_KEY: "test-key" };
  expect(configuredChatModel({ ...context, env })).toMatchObject({
    modelId: DEFAULT_CHAT_MODEL,
  });
  expect(configuredChatModel({ ...context, env: { ...env, AI_MODEL: " " } })).toMatchObject({
    modelId: DEFAULT_CHAT_MODEL,
  });
  expect(
    configuredChatModel({ ...context, env: { ...env, AI_MODEL: "custom-model" } }),
  ).toMatchObject({
    modelId: "custom-model",
  });
});

test("chat requires a server API key even with a default model", () => {
  expect(() => configuredChatModel(context)).toThrow(
    "Ask AI needs OPENAI_API_KEY configured on the server",
  );
});

test("chat sends source references without eagerly loading content and emits text plus usage", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text" });
          controller.enqueue({ type: "text-delta", id: "text", delta: "Friday." });
          controller.enqueue({ type: "text-end", id: "text" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 3, text: 3, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    }),
  });
  const authorize = vi.fn(
    async () => ({}) as Awaited<ReturnType<typeof import("./context").authorizeChatWorkspace>>,
  );
  const begin = vi.fn(async () => ({
    threadId: "thread",
    turns: [],
    replay: null,
    compactedMemory: null,
  }));
  const prepared = await prepareChat(
    context,
    { workspaceId: request.workspaceId, requestId: request.requestId, text: "Read page:plan" },
    {
      authorize,
      model: () => model,
      begin,
      finish: async () => {},
    },
  );
  const events = [];
  for await (const event of prepared.events(new AbortController().signal)) events.push(event);
  expect(authorize).toHaveBeenCalledOnce();
  expect(begin).toHaveBeenCalledWith(
    context,
    expect.objectContaining({ text: "Read [[page:plan]]", roots: [{ type: "page", id: "plan" }] }),
    expect.any(Object),
  );
  expect(events.filter((event) => event.type === "delta")).toEqual([
    { type: "delta", text: "Friday." },
  ]);
  expect(events.at(-1)).toMatchObject({
    type: "done",
    status: "completed",
    inputTokens: 20,
    outputTokens: 3,
  });
  expect(model.doStreamCalls[0]?.prompt).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        content: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining("Mentioned sources (references only)"),
          }),
        ]),
      }),
    ]),
  );
});

test("authorization failure prevents provider setup and streaming", async () => {
  const model = vi.fn();
  await expect(
    prepareChat(context, request, {
      authorize: async () => {
        throw new Error("Forbidden");
      },
      begin: async () => ({ threadId: "thread", turns: [], replay: null, compactedMemory: null }),
      finish: async () => {},
      model,
    }),
  ).rejects.toThrow("Forbidden");
  expect(model).not.toHaveBeenCalled();
});

test("aborting after a partial delta stops the provider and persists the partial answer", async () => {
  const abort = new AbortController();
  let providerSignal: AbortSignal | undefined;
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      providerSignal = options.abortSignal;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({ type: "text-delta", id: "text", delta: "Partial answer" });
          },
        }),
      };
    },
  });
  const finish = vi.fn(async () => {});
  const prepared = await prepareChat(context, request, {
    authorize: async () =>
      ({}) as Awaited<ReturnType<typeof import("./context").authorizeChatWorkspace>>,
    model: () => model,
    begin: async () => ({ threadId: "thread", turns: [], replay: null, compactedMemory: null }),
    finish,
  });
  const events = [];
  for await (const event of prepared.events(abort.signal)) {
    events.push(event);
    if (event.type === "delta") abort.abort();
  }
  expect(providerSignal?.aborted).toBe(true);
  expect(events.at(-1)).toEqual({ type: "done", status: "stopped" });
  expect(finish).toHaveBeenCalledWith(
    request.requestId,
    "Partial answer",
    "stopped",
    undefined,
    expect.objectContaining({ status: "complete" }),
    expect.objectContaining({ activities: [], canContinue: false }),
  );
});

test("provider failure emits a useful error and finalizes the saved turn", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "error", error: new Error("provider unavailable") });
          controller.close();
        },
      }),
    }),
  });
  const finish = vi.fn(async () => {});
  const prepared = await prepareChat(context, request, {
    authorize: async () =>
      ({}) as Awaited<ReturnType<typeof import("./context").authorizeChatWorkspace>>,
    model: () => model,
    begin: async () => ({ threadId: "thread", turns: [], replay: null, compactedMemory: null }),
    finish,
  });
  const events = [];
  for await (const event of prepared.events(new AbortController().signal)) events.push(event);
  expect(events.at(-1)).toEqual({ type: "error", message: expect.stringContaining("Retry") });
  expect(finish).toHaveBeenCalledWith(
    request.requestId,
    "",
    "failed",
    undefined,
    expect.any(Object),
    expect.objectContaining({ activities: [], canContinue: false }),
  );
});
