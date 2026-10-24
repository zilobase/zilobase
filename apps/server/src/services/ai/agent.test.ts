import { afterEach, expect, test, vi } from "vitest";
vi.mock("../operations/context", async (original) => ({
  ...(await original<typeof import("../operations/context")>()),
  runServerOperation: async (_: unknown, run: () => Promise<unknown>) => run(),
}));
import { MockLanguageModelV4 } from "ai/test";
import type { ServerOperationContext } from "../operations/context";
import {
  compactAgentMessages,
  generateReadAgent,
  readAgentLimits,
  assertAgentPromptFits,
} from "./agent";
import { chatRequestSchema } from "@zilobase/features/runtime";
import { createAgentState, type AgentState } from "./agent-state";
import type { ReadToolDependencies } from "./read-tools";

const context = { env: {} } as ServerOperationContext;
afterEach(() => vi.restoreAllMocks());
const usage = {
  inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
for (const discovery of [null, "search_workspace", "semantic_search_workspace", "both"] as const)
  test(`agent ${discovery ? `discovers via ${discovery} then reads` : "reads mentioned sources"} and checkpoints before the next model step`, async () => {
    const discover = Boolean(discovery);
    const logs = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = chatRequestSchema.parse({
      workspaceId: "workspace",
      requestId: "11111111-1111-4111-8111-111111111111",
      text: discover ? "What is due for the launch?" : "What is due on page:page?",
    });
    const state = createAgentState(request.workspaceId, request.roots, [
      { role: "user", content: request.text },
    ]);
    const checkpoints: AgentState[] = [];
    const document = vi.fn(async () => ({
      title: "Plan",
      revision: "1",
      offset: 0,
      hasMore: false,
      entries: [{ kind: "text", block: 0, text: "Due Friday" }],
    }));
    let step = 0;
    const model = new MockLanguageModelV4({
      doStream: async ({ prompt, tools }) => {
        expect(tools?.map((tool) => tool.name)).toEqual(
          expect.arrayContaining(["search_workspace", "semantic_search_workspace"]),
        );
        const current = step++;
        const searching = discover && current === 0;
        const first = current === (discover ? 1 : 0);
        const usingTool = searching || first;
        if (first && discover) {
          expect(state.roots).toEqual([]);
          expect(checkpoints.some((s) => s.grants.some((g) => g.resource.id === "page"))).toBe(
            true,
          );
          expect(state.context.manifest).toEqual([]);
        }
        if (usingTool) expect(JSON.stringify(prompt)).not.toContain("Due Friday");
        else {
          expect(checkpoints.some((s) => s.messages.some((m) => m.role === "tool"))).toBe(true);
          expect(JSON.stringify(prompt)).toContain("Due Friday");
        }
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              if (usingTool) {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: searching ? "search" : "read",
                  toolName: searching
                    ? discovery === "both"
                      ? "search_workspace"
                      : discovery!
                    : "read_page",
                  input: JSON.stringify(searching ? { query: "launch" } : { pageId: "page" }),
                });
                if (searching && discovery === "both")
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId: "semantic-search",
                    toolName: "semantic_search_workspace",
                    input: JSON.stringify({ query: "release plans" }),
                  });
              } else {
                controller.enqueue({ type: "text-start", id: "answer" });
                controller.enqueue({
                  type: "text-delta",
                  id: "answer",
                  delta: "Due Friday. [[page:page]]",
                });
                controller.enqueue({ type: "text-end", id: "answer" });
              }
              controller.enqueue({
                type: "finish",
                finishReason: {
                  unified: usingTool ? "tool-calls" : "stop",
                  raw: usingTool ? "tool_calls" : "stop",
                },
                usage,
              });
              controller.close();
            },
          }),
        };
      },
    });
    const dependencies = {
      document,
      search: vi.fn(async () => ({
        results: [
          {
            type: "page",
            id: "page",
            title: "Launch plan",
            path: "Launch",
            excerpt: "A launch plan",
            updatedAt: new Date(),
          },
        ],
      })),
      authorizeWorkspace: async () => ({}),
    } as unknown as ReadToolDependencies;
    const chunks = [];
    for await (const chunk of generateReadAgent(context, state, new AbortController().signal, {
      model,
      dependencies,
      persistence: {
        checkpoint: async (s) => {
          checkpoints.push(s);
        },
      },
    }))
      chunks.push(chunk);
    expect(document).toHaveBeenCalledOnce();
    const modes = vi.mocked(dependencies.search).mock.calls.map(([, input]) => input.mode);
    expect(modes).toEqual(
      discovery === "both"
        ? ["keyword", "semantic"]
        : discovery
          ? [discovery === "search_workspace" ? "keyword" : "semantic"]
          : [],
    );
    expect(
      chunks
        .filter((c) => c.text)
        .map((c) => c.text)
        .join(""),
    ).toBe("Due Friday. [[page:page]]");
    expect(chunks.at(-1)).toMatchObject({
      completed: true,
      usage: { inputTokens: discover ? 60 : 40, outputTokens: discover ? 15 : 10 },
    });
    expect(state.progress.activities.at(-1)).toMatchObject({ id: "read", status: "completed" });
    expect(state.context.manifest[0]?.key).toBe("page:page");
    expect(state.messages.at(-1)?.role).toBe("assistant");
    expect(state.debug!.events.filter((event) => event.type === "model.request")).toHaveLength(
      discover ? 3 : 2,
    );
    expect(state.debug!.events.filter((event) => event.type === "model.response")).toHaveLength(
      discover ? 3 : 2,
    );
    expect(
      state.debug!.events.find(
        (event) => event.type === "tool.result" && event.tool === "read_page",
      )!.payload,
    ).toContain("Due Friday");
    expect(state.debug!.events.at(-1)!.type).toBe("run.completed");
    expect(JSON.stringify(state.progress)).not.toContain("Due Friday");
    const diagnostics = logs.mock.calls.map((call) => JSON.parse(call[0]));
    expect(
      diagnostics.filter((event) => event.stage === "model" && event.phase === "end"),
    ).toHaveLength(discover ? 3 : 2);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        stage: "tool_read",
        phase: "end",
        tool: "read_page",
        outcome: "ok",
      }),
    );
    expect(JSON.stringify(diagnostics)).not.toMatch(/Due Friday|What is due|Mentioned page/);
  });

test("compaction removes whole tool exchanges and preserves the latest request", () => {
  const result = compactAgentMessages(
    [
      { role: "user", content: "original question" },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "old", toolName: "read_page", input: {} }],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "old",
            toolName: "read_page",
            output: { type: "text", value: "x".repeat(4000) },
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "new", toolName: "read_page", input: {} }],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "new",
            toolName: "read_page",
            output: { type: "text", value: "latest evidence" },
          },
        ],
      },
    ],
    1000,
  );
  expect(result.omitted).toBe(1);
  expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
  expect(JSON.stringify(result.messages)).not.toContain('"old"');
  expect(JSON.stringify(result.messages)).toContain("original question");
});

test("limits reject invalid deployment settings rather than silently exceeding them", () => {
  expect(() => readAgentLimits({ AI_MAX_STEPS: "0" })).toThrow(/AI_MAX_STEPS/);
  expect(() => readAgentLimits({ AI_CONTEXT_WINDOW_TOKENS: "invalid" })).toThrow(
    /AI_CONTEXT_WINDOW_TOKENS/,
  );
  expect(readAgentLimits({})).toMatchObject({ maxSteps: 12, maxCalls: 24, totalTokens: 128000 });
  expect(() => assertAgentPromptFits({}, [{ role: "user", content: "x".repeat(32768) }])).toThrow(
    /Shorten the question/,
  );
});
test("an exhausted context or usage budget completes with explicit coverage and no provider call", async () => {
  const state = createAgentState(
    "workspace",
    [{ type: "page", id: "page" }],
    [{ role: "user", content: "Read this source" }],
  );
  state.usage!.actualInput = 8192;
  const model = new MockLanguageModelV4();
  const chunks = [];
  for await (const chunk of generateReadAgent(
    { ...context, env: { AI_RUN_TOKEN_BUDGET: "8192" } },
    state,
    new AbortController().signal,
    { model },
  ))
    chunks.push(chunk);
  expect(model.doStreamCalls).toHaveLength(0);
  expect(chunks.at(-1)).toMatchObject({
    completed: true,
    progress: { canContinue: true, stopReason: "token_budget" },
  });
  expect(state.context.status).toBe("partial");
});

function responseStream(call?: { toolName: string; input: unknown }) {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        if (call)
          controller.enqueue({
            type: "tool-call",
            toolCallId: crypto.randomUUID(),
            toolName: call.toolName,
            input: JSON.stringify(call.input),
          });
        else {
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: "Summary from read evidence. [[page:page]]",
          });
          controller.enqueue({ type: "text-end", id: "answer" });
        }
        controller.enqueue({
          type: "finish",
          finishReason: {
            unified: call ? "tool-calls" : "stop",
            raw: call ? "tool_calls" : "stop",
          },
          usage,
        });
        controller.close();
      },
    }),
  };
}

test("reported usage releases reservations so six small calls do not exhaust a 128k run", async () => {
  const fixture = budgetFixture();
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async () =>
      responseStream(step++ < 7 ? { toolName: "read_page", input: { pageId: "page" } } : undefined),
  });
  for await (const _chunk of generateReadAgent(fixture.context, fixture.state, fixture.signal, {
    model,
    dependencies: fixture.dependencies,
  })) {
    /* drain */
  }
  expect(model.doStreamCalls).toHaveLength(8);
  expect(fixture.state.chargedTokens).toBe(8 * 25);
  expect(fixture.state.usage).toMatchObject({ actualInput: 160, actualOutput: 40, uncertain: 0 });
  expect(fixture.state.progress.stopReason).toBeUndefined();
});

test("the last model step receives no tools and can summarize evidence before stopping", async () => {
  const fixture = budgetFixture();
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      if (step++ === 0) return responseStream({ toolName: "read_page", input: { pageId: "page" } });
      expect(options.toolChoice).toEqual({ type: "none" });
      expect(options.tools ?? []).toHaveLength(0);
      return responseStream();
    },
  });
  const chunks = [];
  for await (const chunk of generateReadAgent(
    { ...fixture.context, env: { AI_MAX_STEPS: "2" } },
    fixture.state,
    fixture.signal,
    { model, dependencies: fixture.dependencies },
  ))
    chunks.push(chunk);
  expect(chunks.at(-1)?.completed).toBe(true);
  expect(fixture.state.progress.stopReason).toBe("step_budget");
  expect(fixture.state.debug!.events.some((event) => event.type === "run.error")).toBe(false);
});

function budgetFixture() {
  return {
    context,
    signal: new AbortController().signal,
    state: createAgentState(
      "workspace",
      [{ type: "page", id: "page" }],
      [{ role: "user", content: "Read the page" }],
    ),
    dependencies: {
      authorizeWorkspace: async () => ({}),
      document: async () => ({
        title: "Page",
        revision: "1",
        offset: 0,
        entries: [],
        hasMore: false,
      }),
    } as unknown as ReadToolDependencies,
  };
}

function databaseFixture() {
  const databaseId = "ff1bc657-2e08-4bc8-bafc-2114293a2a55";
  const sourceId = "7fabd878-9767-4271-b25c-869882105364";
  const document = vi.fn(async () => ({
    title: "Launch plan",
    revision: "1",
    offset: 0,
    hasMore: false,
    entries: [
      { kind: "text", block: 0, text: "The launch is on Friday. Morgan owns the rollout." },
    ],
  }));
  const query = vi.fn(async () => ({
    revision: { database: 1, source: 1 },
    properties: [],
    records: [
      {
        id: "row",
        pageId: "page",
        name: "Launch plan",
        parentRowId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        values: {},
      },
    ],
    positions: [{ id: "row", value: "row" }],
    hasMore: false,
  }));
  const dependencies = {
    authorizeWorkspace: async () => ({}),
    authorizeDatabase: async () => ({}),
    authorizePage: async () => ({}),
    metadataRevision: async () => "1:1",
    describe: async () => ({
      title: "Projects",
      revision: "1:1",
      section: "sources",
      entries: [{ id: sourceId, name: "This is a test document", version: 1 }],
      hasMore: false,
    }),
    query,
    document,
  } as unknown as ReadToolDependencies;
  return {
    databaseId,
    sourceId,
    dependencies,
    query,
    document,
    state: createAgentState(
      "workspace",
      [{ type: "database", id: databaseId }],
      [{ role: "user", content: `Summarize the attached pages [[database:${databaseId}]]` }],
    ),
  };
}

test("the reported source/page confusion recovers into records and page bodies without a false budget stop", async () => {
  const fixture = databaseFixture();
  let step = 0;
  const sequence = [
    { toolName: "describe_source", input: { type: "database", id: fixture.databaseId } },
    { toolName: "read_page", input: { pageId: fixture.sourceId } },
    { toolName: "describe_source", input: { type: "database", id: fixture.databaseId } },
    {
      toolName: "query_records",
      input: { databaseId: fixture.databaseId, dataSourceId: fixture.sourceId },
    },
    { toolName: "read_page", input: { pageId: "page" } },
  ];
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      if (step === 2) expect(JSON.stringify(prompt)).toContain("RESOURCE_TYPE_MISMATCH");
      if (step === 5) expect(JSON.stringify(prompt)).toContain("The launch is on Friday");
      return responseStream(sequence[step++]);
    },
  });
  for await (const _chunk of generateReadAgent(
    context,
    fixture.state,
    new AbortController().signal,
    { model, dependencies: fixture.dependencies },
  )) {
    /* drain */
  }
  expect(fixture.query).toHaveBeenCalledOnce();
  expect(fixture.document).toHaveBeenCalledOnce();
  expect(fixture.state.progress.stopReason).toBeUndefined();
  expect(fixture.state.chargedTokens).toBe(150);
  expect(fixture.state.debug!.events.some((event) => event.type === "run.error")).toBe(false);
});

test("metadata access is checked before the next provider request", async () => {
  const fixture = databaseFixture();
  fixture.dependencies.metadataRevision = vi.fn(async () => {
    throw new (await import("../operations/context")).ServerOperationError(
      { error: "Forbidden" },
      403,
    );
  });
  const model = new MockLanguageModelV4({
    doStream: async () =>
      responseStream({
        toolName: "describe_source",
        input: { type: "database", id: fixture.databaseId },
      }),
  });
  for await (const _chunk of generateReadAgent(
    context,
    fixture.state,
    new AbortController().signal,
    { model, dependencies: fixture.dependencies },
  )) {
    /* drain */
  }
  expect(model.doStreamCalls).toHaveLength(1);
  expect(fixture.state.progress.stopReason).toBe("source_unavailable");
  expect(fixture.state.progress.canContinue).toBe(false);
  expect(fixture.state.debug!.events.some((event) => event.type === "run.error")).toBe(false);
});

test.skipIf(process.env.AI_LIVE_SMOKE !== "1")(
  "configured model discovers records and reads the returned page body",
  async () => {
    const fixture = databaseFixture();
    const liveContext = { ...context, env: { ...process.env } } as ServerOperationContext;
    for await (const _chunk of generateReadAgent(
      liveContext,
      fixture.state,
      AbortSignal.timeout(90_000),
      { dependencies: fixture.dependencies },
    )) {
      /* drain */
    }
    expect(fixture.query).toHaveBeenCalled();
    expect(fixture.document).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pageId: "page" }),
    );
    expect(fixture.state.committedText).toMatch(/Friday/i);
    expect(fixture.state.debug!.events.some((event) => event.type === "run.error")).toBe(false);
  },
  100_000,
);

test("a small run budget preserves an affordable synthesis request with tools disabled", async () => {
  const fixture = budgetFixture();
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      expect(options.toolChoice).toEqual({ type: "none" });
      expect(options.tools ?? []).toHaveLength(0);
      expect(options.maxOutputTokens).toBeGreaterThanOrEqual(256);
      return responseStream();
    },
  });
  for await (const _chunk of generateReadAgent(
    { ...context, env: { AI_RUN_TOKEN_BUDGET: "8192" } },
    fixture.state,
    fixture.signal,
    { model, dependencies: fixture.dependencies },
  )) {
    /* drain */
  }
  expect(model.doStreamCalls).toHaveLength(1);
  expect(fixture.state.progress.stopReason).toBe("token_budget");
  expect(fixture.state.debug!.events.some((event) => event.type === "run.error")).toBe(false);
});
