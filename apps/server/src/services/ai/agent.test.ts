import { afterEach, expect, test, vi } from "vitest";
vi.mock("./intent", async (original) => {
  const actual = await original<typeof import("./intent")>();
  return {
    ...actual,
    routeSearchIntent: async (...args: Parameters<typeof actual.routeSearchIntent>) =>
      process.env.AI_LIVE_SMOKE === "1"
        ? actual.routeSearchIntent(...args)
        : {
            intent: {
              mode: /^Find\b/i.test(actual.currentQuestion(args[1])) ? "list" : "read",
              keywordQuery: null,
              teamspaceNames: [],
            },
            usage: {},
          },
  };
});
vi.mock("../operations/context", async (original) => ({
  ...(await original<typeof import("../operations/context")>()),
  runServerOperation: async (_: unknown, run: () => Promise<unknown>) => run(),
}));
import { MockLanguageModelV4 } from "ai/test";
import type { ServerOperationContext } from "../operations/context";
import { generateReadAgent } from "./agent";
import { chatRequestSchema } from "@zilobase/features/runtime";
import { createAgentState, resumeAgentState, type AgentState } from "./agent-state";
import type { ReadToolDependencies } from "./read-tools";
import { rememberRead } from "./agent-memory";

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

for (const toolName of ["search_workspace", "semantic_search_workspace"])
  test(`${toolName} lists matches and stops without another model call or page read`, async () => {
    const fixture = agentFixture();
    fixture.state = createAgentState(
      "workspace",
      [],
      [{ role: "user", content: "Find pages and databases mentioning support macros" }],
    );
    const search = vi.fn(async () => ({
      results: [
        {
          type: "page" as const,
          id: "launch",
          title: "Review launch checklist",
          path: "Launch",
          excerpt: "Support macros",
          emoji: null,
          entity: {},
          updatedAt: new Date(),
        },
        ...(toolName === "search_workspace"
          ? [
              {
                type: "database" as const,
                id: "tasks",
                title: "Tasks",
                path: "Tasks",
                excerpt: null,
                emoji: null,
                entity: {},
                updatedAt: new Date(),
              },
            ]
          : []),
      ],
    }));
    const document = vi.fn();
    const model = new MockLanguageModelV4({
      doStream: async ({ prompt }) => {
        expect(JSON.stringify(prompt)).toContain("responseMode=list");
        return responseStream({
          toolName,
          input: { query: "support macros", responseMode: "list" },
        });
      },
    });
    const chunks = [];
    for await (const chunk of generateReadAgent(context, fixture.state, fixture.signal, {
      model,
      dependencies: { ...fixture.dependencies, search, document } as ReadToolDependencies,
    }))
      chunks.push(chunk);
    const text = chunks.map((chunk) => chunk.text ?? "").join("");
    expect(text).toContain("[Review launch checklist](/p/launch)");
    if (toolName === "search_workspace") expect(text).toContain("[Tasks](/d/tasks)");
    expect(text).toContain("page contents were not read");
    expect(model.doStreamCalls).toHaveLength(1);
    expect(search).toHaveBeenCalledOnce();
    expect(document).not.toHaveBeenCalled();
    expect(fixture.state.context.manifest).toEqual([]);
    expect(fixture.state.progress.canContinue).toBe(false);
    expect(fixture.state.progress.stopReason).toBeUndefined();
    expect(resumeAgentState(fixture.state)).toBe(false);
  });

test("a 50-match listing does not need to fit another model request or the read-result byte cap", async () => {
  const fixture = agentFixture();
  fixture.state = createAgentState("workspace", [], [{ role: "user", content: "Find 50 pages" }]);
  const search = vi.fn(async () => ({
    results: Array.from({ length: 50 }, (_, i) => ({
      type: "page" as const,
      id: `match-${i}`,
      title: `[Page ${i}] ` + "界".repeat(200),
      path: "界".repeat(200),
      excerpt: "界".repeat(200),
      emoji: null,
      entity: {},
      updatedAt: new Date(),
    })),
  }));
  const model = new MockLanguageModelV4({
    doStream: async () =>
      responseStream({
        toolName: "search_workspace",
        input: { query: "pages", limit: 50, responseMode: "list" },
      }),
  });
  for await (const _chunk of generateReadAgent(context, fixture.state, fixture.signal, {
    model,
    dependencies: { ...fixture.dependencies, search } as ReadToolDependencies,
  })) {
    /* drain */
  }
  expect(fixture.state.committedText).toContain("/p/match-49");
  expect(fixture.state.committedText).toContain("\\[Page 0\\]");
  expect(model.doStreamCalls).toHaveLength(1);
  expect(fixture.state.progress.stopReason).toBeUndefined();
  expect(fixture.state.progress.canContinue).toBe(false);
});

test("a recovered listing finishes from its checkpoint without searching or reading again", async () => {
  const fixture = agentFixture();
  fixture.state.searchListing = { matches: [{ type: "page", id: "found", title: "Found" }] };
  const model = new MockLanguageModelV4();
  const chunks = [];
  for await (const chunk of generateReadAgent(context, fixture.state, fixture.signal, { model }))
    chunks.push(chunk);
  expect(chunks.map((chunk) => chunk.text ?? "").join("")).toContain("[Found](/p/found)");
  expect(model.doStreamCalls).toHaveLength(0);
  expect(fixture.state.searchListing.emitted).toBe(true);
});

test("continuation uses a fresh window and resumes the existing page cursor without rediscovery", async () => {
  const fixture = agentFixture();
  fixture.state.grants.push({ resource: { type: "page", id: "completed" } });
  rememberRead(fixture.state, "read_page", { type: "page", id: "completed" }, true, 1);
  // Obtain a real cursor through the tool so fingerprint validation remains exercised.
  const { createReadTools, readToolSchemas } = await import("./read-tools");
  const document = vi.fn(async (_context: unknown, input: { offset?: number }) => ({
    title: "Page",
    revision: "1",
    offset: input.offset ?? 0,
    entries: [
      {
        kind: "text",
        block: input.offset ?? 0,
        text: input.offset ? "Remaining text" : "First text",
      },
    ],
    hasMore: !input.offset,
  }));
  const dependencies = {
    ...fixture.dependencies,
    document,
    search: vi.fn(),
  } as ReadToolDependencies;
  const tools = createReadTools(context, fixture.state, {
    signal: fixture.signal,

    dependencies,
  });
  const first = (await tools.read_page.execute!(
    readToolSchemas.read_page.parse({ pageId: "page" }),
    {
      toolCallId: "first",
      messages: [],
      context: {},
      abortSignal: fixture.signal,
    },
  )) as { continuation: { nextCursor: string } };
  fixture.state.messages.push({ role: "assistant", content: "old tool transcript ".repeat(10000) });
  fixture.state.progress.stopReason = "context_budget";
  expect(resumeAgentState(fixture.state)).toBe(true);
  expect(JSON.stringify(fixture.state.messages)).not.toContain("old tool transcript");
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt, tools }) => {
      expect(tools?.map((tool) => tool.name)).not.toContain("search_workspace");
      expect(tools?.map((tool) => tool.name)).not.toContain("semantic_search_workspace");
      expect(JSON.stringify(prompt)).toContain("completed");
      return responseStream(
        step++ === 0
          ? {
              toolName: "read_page",
              input: { pageId: "page", cursor: first.continuation.nextCursor },
            }
          : undefined,
      );
    },
  });
  for await (const _chunk of generateReadAgent(context, fixture.state, fixture.signal, {
    model,
    dependencies,
  })) {
    /* drain */
  }
  expect(dependencies.search).not.toHaveBeenCalled();
  expect(document).toHaveBeenCalledTimes(2);
  expect(document.mock.calls[1][1].offset).toBe(1);
  expect(fixture.state.pending).toEqual({});
  expect(fixture.state.progress.canContinue).toBe(false);
  expect(fixture.state.progress.stopReason).toBeUndefined();
});

test("a continuation that makes no progress cannot offer another continue loop", async () => {
  const fixture = agentFixture();
  fixture.state.progress.stopReason = "context_budget";
  expect(resumeAgentState(fixture.state)).toBe(true);
  const model = new MockLanguageModelV4({ doStream: async () => responseStream() });
  for await (const _chunk of generateReadAgent(context, fixture.state, fixture.signal, {
    model,
    dependencies: fixture.dependencies,
  })) {
    /* drain */
  }
  expect(fixture.state.progress).toMatchObject({ canContinue: false, stopReason: "no_progress" });
  expect(resumeAgentState(fixture.state)).toBe(false);
});

test("repeating a completed search stops retrieval without offering continuation for its unread matches", async () => {
  const fixture = agentFixture();
  fixture.state = createAgentState(
    "workspace",
    [],
    [{ role: "user", content: "What blocks launch?" }],
  );
  const search = vi.fn(async () => ({
    results: [
      {
        type: "page" as const,
        id: "page",
        title: "Launch",
        path: "Launch",
        excerpt: null,
        emoji: null,
        entity: {},
        updatedAt: new Date(),
      },
    ],
  }));
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async () =>
      responseStream(
        step++ < 2
          ? {
              toolName: "search_workspace",
              input: { query: "launch", responseMode: "read" },
            }
          : undefined,
      ),
  });
  for await (const _chunk of generateReadAgent(context, fixture.state, fixture.signal, {
    model,
    dependencies: { ...fixture.dependencies, search } as ReadToolDependencies,
  })) {
    /* drain */
  }
  expect(search).toHaveBeenCalledOnce();
  expect(fixture.state.progress).toMatchObject({ canContinue: false, stopReason: "no_progress" });
});

test("reported token usage remains telemetry and never stops a run", async () => {
  const fixture = agentFixture();
  let revision = 0;
  fixture.dependencies.document = async () => ({
    title: "Page",
    revision: String(++revision),
    offset: 0,
    entries: [],
    hasMore: false,
  });
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
  expect(fixture.state.inputTokens).toBe(8 * 20);
  expect(fixture.state.progress.stopReason).toBeUndefined();
});

test("runs can exceed the former step and tool-call ceilings even when old settings are present", async () => {
  const fixture = agentFixture();
  fixture.state = createAgentState(
    "workspace",
    Array.from({ length: 35 }, (_, i) => ({ type: "page", id: `page-${i}` })),
    [{ role: "user", content: "Read these pages" }],
  );
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      expect(options.maxOutputTokens).toBeUndefined();
      return responseStream(
        step < 35 ? { toolName: "read_page", input: { pageId: `page-${step++}` } } : undefined,
      );
    },
  });
  for await (const _chunk of generateReadAgent(
    {
      ...context,
      env: {
        AI_MAX_STEPS: "2",
        AI_MAX_TOOL_CALLS: "1",
        AI_RUN_TOKEN_BUDGET: "1",
        AI_TOOL_RESULT_BYTES: "1",
        AI_CONTEXT_WINDOW_TOKENS: "1000000",
      },
    },
    fixture.state,
    fixture.signal,
    { model, dependencies: fixture.dependencies },
  )) {
    /* drain */
  }
  expect(model.doStreamCalls).toHaveLength(36);
  expect(fixture.state.calls).toBe(35);
  expect(fixture.state.progress.stopReason).toBeUndefined();
});

test("compaction progress streams before the summarizer completes its model call", async () => {
  const fixture = agentFixture();
  fixture.state.messages.unshift({
    role: "assistant",
    content: "Earlier launch decisions. ".repeat(2500),
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      await gate;
      return {
        content: [{ type: "text", text: "Launch was agreed for Friday." }],
        finishReason: { unified: "stop", raw: "stop" },
        warnings: [],
        usage,
      };
    },
    doStream: async ({ prompt }) => {
      expect(JSON.stringify(prompt)).toContain("Launch was agreed for Friday");
      return responseStream();
    },
  });
  const stream = generateReadAgent(context, fixture.state, fixture.signal, { model });
  await stream.next();
  try {
    let running = false;
    while (!running) {
      const event = await stream.next();
      if (event.done) break;
      running = event.value.progress?.compaction?.status === "running";
    }
    expect(running).toBe(true);
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    release();
  }
  for await (const _chunk of stream) {
    /* drain */
  }
  expect(fixture.state.progress.compaction?.status).toBe("completed");
});

function agentFixture() {
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
  expect(fixture.state.inputTokens).toBe(120);
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
  "configured model lists found sources without reading their bodies",
  async () => {
    const fixture = agentFixture();
    fixture.state = createAgentState(
      "workspace",
      [],
      [
        {
          role: "user",
          content: "Find pages and databases mentioning support macros",
        },
      ],
    );
    const search = vi.fn(async () => ({
      results: [
        {
          type: "page" as const,
          id: "launch",
          title: "Review launch checklist",
          path: "Launch",
          excerpt: "Support macros",
          emoji: null,
          entity: {},
          updatedAt: new Date(),
        },
      ],
    }));
    const document = vi.fn();
    for await (const _chunk of generateReadAgent(
      { ...context, env: { ...process.env } },
      fixture.state,
      AbortSignal.timeout(90_000),
      { dependencies: { ...fixture.dependencies, search, document } },
    )) {
      /* drain */
    }
    expect(search).toHaveBeenCalledOnce();
    expect(document).not.toHaveBeenCalled();
    expect(fixture.state.committedText).toContain("[Review launch checklist](/p/launch)");
    expect(fixture.state.progress.canContinue).toBe(false);
    expect(
      fixture.state.debug!.events.filter((event) => event.type === "model.request"),
    ).toHaveLength(1);
  },
  100_000,
);

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
