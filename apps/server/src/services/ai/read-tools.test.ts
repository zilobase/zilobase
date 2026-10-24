import { expect, test, vi } from "vitest";
vi.mock("../operations/context", async (original) => ({
  ...(await original<typeof import("../operations/context")>()),
  runServerOperation: async (_: unknown, run: () => Promise<unknown>) => run(),
}));
import type { ServerOperationContext } from "../operations/context";
import { ServerOperationError } from "../operations/context";
import { chatRequestSchema } from "@zilobase/features/runtime";
import { createAgentState } from "./agent-state";
import { createReadTools, readToolSchemas, type ReadToolDependencies } from "./read-tools";

export function readFixture() {
  const context = {
    env: {},
    authentication: { user: { id: "actor" } },
  } as unknown as ServerOperationContext;
  const request = chatRequestSchema.parse({
    workspaceId: "workspace",
    requestId: "11111111-1111-4111-8111-111111111111",
    text: "Question about page:page and [[database:db]]",
  });
  const state = createAgentState(request.workspaceId, request.roots, [
    { role: "user", content: request.text },
  ]);
  const dependencies = {
    search: vi.fn(async () => ({
      results: [
        { type: "page", id: "found-page", title: "Launch plan" },
        { type: "database", id: "found-db", title: "Launch tasks" },
      ].map((item) => ({
        ...item,
        path: item.title,
        excerpt: "Search snippet",
        emoji: null,
        updatedAt: new Date("2026-10-22T00:00:00Z"),
        entity: { private: "Never return the underlying entity" },
      })),
    })),
    users: vi.fn(async () => ({
      type: "user_search",
      users: [{ id: "ada", name: "Ada", email: "ada@example.test" }],
      exhaustive: false,
    })),
    authorizeWorkspace: vi.fn(async () => ({})),
    metadataRevision: vi.fn(async () => "v1"),
    authorizeDatabase: vi.fn(async () => ({})),
    authorizePage: vi.fn(async () => ({})),
    document: vi.fn(async ({}, input: { pageId: string; offset?: number }) => ({
      title: input.pageId,
      revision: "v1",
      offset: input.offset ?? 0,
      entries:
        input.pageId === "page"
          ? [{ kind: "reference", resource: { type: "page", id: "linked" } }]
          : [{ kind: "text", block: 0, text: "Private linked content" }],
      hasMore: false,
    })),
    describe: vi.fn(async () => ({
      title: "Tasks",
      revision: "v1",
      section: "sources",
      entries: [{ id: "source", name: "Tasks" }],
      hasMore: false,
    })),
    query: vi.fn(async ({}, input: { recordId?: string }) => ({
      revision: { database: 1, source: 1 },
      properties: [],
      records: [
        {
          id: input.recordId ?? "row",
          pageId: "row-page",
          name: "Task",
          parentRowId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          values: {},
        },
      ],
      positions: [{ id: "row", value: "row" }],
      hasMore: true,
    })),
    aggregate: vi.fn(async () => ({
      revision: { database: 1, source: 1 },
      operation: "count",
      value: 800,
      matchingRecords: 800,
      complete: true,
    })),
  } as unknown as ReadToolDependencies;
  const signal = new AbortController().signal;
  const tools = createReadTools(context, state, {
    signal,
    maxCalls: 24,
    maxResultBytes: 6000,
    dependencies,
  });
  const call = async (name: keyof typeof tools, raw: unknown) => {
    const input = readToolSchemas[name].parse(raw);
    const execute = tools[name].execute! as (input: unknown, options: unknown) => Promise<any>;
    return execute(input, { toolCallId: `tool-${state.calls}`, messages: [], abortSignal: signal });
  };
  return { context, state, dependencies, signal, tools, call };
}

test("only read operations are registered and @mentions do not read content", () => {
  const { tools, dependencies } = readFixture();
  expect(Object.keys(tools)).toEqual([
    "search_workspace",
    "semantic_search_workspace",
    "describe_source",
    "read_page",
    "query_records",
    "read_record",
    "aggregate_records",
  ]);
  expect(dependencies.document).not.toHaveBeenCalled();
  expect(dependencies.query).not.toHaveBeenCalled();
  expect(dependencies.search).not.toHaveBeenCalled();
});

test("workspace search validates nonempty bounded queries without accepting a workspace override", () => {
  const schema = readToolSchemas.search_workspace;
  expect(schema.parse({ query: " launch " })).toEqual({
    queryType: "content",
    query: "launch",
    types: [],
    limit: 10,
  });
  expect(schema.parse({ query: "launch", limit: 50 }).limit).toBe(50);
  expect(
    readToolSchemas.semantic_search_workspace.parse({ query: "launch", limit: 50 }).limit,
  ).toBe(50);
  expect(
    readToolSchemas.semantic_search_workspace.safeParse({ query: "launch", limit: 51 }).success,
  ).toBe(false);
  for (const input of [
    { query: " " },
    { query: "x".repeat(513) },
    { query: "launch", workspaceId: "other-workspace" },
    { query: "launch", limit: 51 },
    { query: "launch", limit: 0 },
    { query: "launch", types: ["user"] },
  ])
    expect(schema.safeParse(input).success).toBe(false);
});

test("search discovers accessible sources without mentions but grants no citation evidence", async () => {
  const { call, dependencies, state } = readFixture();
  state.roots = [];
  state.grants = [];
  const result = await call("search_workspace", { query: "launch", types: ["page", "database"] });
  expect(dependencies.search).toHaveBeenCalledWith(
    expect.objectContaining({ pinnedWorkspaceId: "workspace" }),
    {
      workspaceId: "workspace",
      q: "launch",
      types: "database,page",
      mode: "keyword",
      limit: 10,
    },
  );
  expect(result).toMatchObject({
    exhaustive: false,
    results: [
      { type: "page", id: "found-page", title: "Launch plan", excerpt: "Search snippet" },
      { type: "database", id: "found-db", title: "Launch tasks" },
    ],
    coverage: { returned: 2, total: null },
  });
  expect(JSON.stringify(result)).not.toContain("Never return the underlying entity");
  expect(state.context.manifest).toEqual([]);
  expect(state.roots).toEqual([]);
  expect(state.progress.activities.at(-1)).toMatchObject({
    name: "search_workspace",
    query: "launch",
    status: "completed",
    returned: 2,
  });
  expect(state.progress.activities.at(-1)?.source).toBeUndefined();
  expect(JSON.stringify(state.progress)).not.toContain("Search snippet");
  expect(await call("read_page", { pageId: "found-page" })).toMatchObject({
    entries: [{ text: "Private linked content" }],
  });
  expect(await call("describe_source", { type: "database", id: "found-db" })).toMatchObject({
    databaseId: "found-db",
  });
  expect(await call("read_page", { pageId: "not-returned" })).toMatchObject({
    error: { code: "OUT_OF_SCOPE" },
  });
});

test("semantic property discovery supplies a live record reference without establishing evidence", async () => {
  const { call, dependencies, state } = readFixture();
  vi.mocked(dependencies.search).mockResolvedValue({
    results: [
      {
        type: "page",
        id: "row-page",
        title: "Task",
        path: "Task",
        excerpt: "An indexed old status",
        emoji: null,
        updatedAt: new Date(),
        entity: {},
        match: {
          chunkId: "chunk",
          pageId: "row-page",
          kind: "property",
          headingPath: ["Status"],
          propertyId: "status",
          databaseId: "discovered-db",
          dataSourceId: "discovered-source",
          recordId: "record",
        },
      },
    ],
  } as never);
  const search = await call("semantic_search_workspace", { query: "Which task cannot ship?" });
  expect(search.results[0].match).toMatchObject({ recordId: "record", propertyId: "status" });
  expect(state.context.manifest).toEqual([]);
  vi.mocked(dependencies.query).mockResolvedValue({
    revision: { database: 2, source: 2 },
    properties: [{ id: "status", name: "Status", type: "text" }],
    records: [
      { id: "record", pageId: "row-page", name: "Task", values: { status: "Current live value" } },
    ],
    positions: [{ id: "record", value: "record" }],
    hasMore: false,
  } as never);
  const read = await call("read_record", {
    databaseId: "discovered-db",
    dataSourceId: "discovered-source",
    recordId: "record",
    propertyIds: ["status"],
  });
  expect(dependencies.query).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ recordId: "record", propertyIds: ["status"] }),
    undefined,
    undefined,
  );
  expect(read.records[0].values.status).toBe("Current live value");
  expect(
    state.context.manifest.some((entry) => entry.type === "record" && entry.id === "record"),
  ).toBe(true);
  expect(JSON.stringify(state.context.manifest)).not.toContain("An indexed old status");
});

test("property discovery survives run replay but revoked live reads add no citation evidence", async () => {
  const fixture = readFixture();
  vi.mocked(fixture.dependencies.search).mockResolvedValue({
    results: [
      {
        type: "page",
        id: "row-page",
        title: "Task",
        path: "Task",
        excerpt: "Indexed",
        emoji: null,
        updatedAt: new Date(),
        entity: {},
        match: {
          chunkId: "chunk",
          pageId: "row-page",
          kind: "property",
          headingPath: ["Status"],
          propertyId: "status",
          databaseId: "discovered-db",
          dataSourceId: "source",
          recordId: "record",
        },
      },
    ],
  } as never);
  await fixture.call("semantic_search_workspace", { query: "Blocked work" });
  const restored = structuredClone(fixture.state);
  vi.mocked(fixture.dependencies.query).mockRejectedValue(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  const tools = createReadTools(fixture.context, restored, {
    signal: fixture.signal,
    maxCalls: 24,
    maxResultBytes: 6000,
    dependencies: fixture.dependencies,
  });
  const result = await tools.read_record.execute!(
    readToolSchemas.read_record.parse({
      databaseId: "discovered-db",
      dataSourceId: "source",
      recordId: "record",
      propertyIds: ["status"],
    }),
    {
      toolCallId: "replayed",
      messages: [],
      abortSignal: fixture.signal,
      context: undefined as never,
    },
  );
  expect(result).toMatchObject({ error: { code: "SOURCE_UNAVAILABLE" } });
  expect(fixture.dependencies.query).toHaveBeenCalled();
  expect(restored.context.manifest).toEqual([]);
});

for (const name of ["search_workspace", "semantic_search_workspace"] as const)
  test(`${name} returns 50 matches without a result-byte budget and grants only returned matches`, async () => {
    const fixture = readFixture();
    const template = (await fixture.dependencies.search(fixture.context, {})).results[0]!;
    vi.mocked(fixture.dependencies.search).mockResolvedValue({
      results: Array.from({ length: 55 }, (_, i) => ({
        ...template,
        id: `hit-${i}`,
        title: "界".repeat(500),
        path: "界".repeat(700),
        excerpt: "界".repeat(500),
      })),
    });
    const tools = createReadTools(fixture.context, fixture.state, {
      signal: fixture.signal,
      maxCalls: 24,
      maxResultBytes: 4096,
      dependencies: fixture.dependencies,
    });
    const result = (await tools[name].execute!(
      { queryType: "content", query: "launch", limit: 50, types: [] },
      { toolCallId: "search", messages: [], abortSignal: fixture.signal, context: {} },
    )) as any;
    expect(Buffer.byteLength(JSON.stringify(result))).toBeGreaterThan(4096);
    expect(result.results).toHaveLength(50);
    expect(result.results.at(-1).id).toBe("hit-49");
    expect(fixture.state.progress.activities.at(-1)).toMatchObject({
      status: "completed",
      returned: 50,
    });
    expect(result.coverage.complete).toBe(false);
    expect(
      fixture.state.grants.filter((entry) => entry.resource.id.startsWith("hit-")),
    ).toHaveLength(result.results.length);
    expect(
      fixture.state.grants.some((entry) => entry.resource.id === `hit-${result.results.length}`),
    ).toBe(false);
    expect(Object.keys(fixture.state.pending)).toHaveLength(0);
  });

test("search limits and type filters are forwarded; empty results are not an exhaustive absence claim", async () => {
  const { call, dependencies, state } = readFixture();
  const result = await call("search_workspace", { query: "launch", limit: 1, types: ["page"] });
  expect(result.results).toHaveLength(1);
  expect(result.coverage.complete).toBe(false);
  expect(dependencies.search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ types: "page" }),
  );
  vi.mocked(dependencies.search).mockResolvedValueOnce({ results: [] });
  expect(await call("search_workspace", { query: "missing" })).toMatchObject({
    results: [],
    exhaustive: false,
    coverage: { returned: 0, total: null },
    next: expect.stringContaining("does not prove absence"),
  });
  expect(state.grants.some((entry) => entry.resource.id === "found-db")).toBe(false);
});

test("search requires current workspace access and discovered pages still recheck read access", async () => {
  const { call, dependencies, state } = readFixture();
  vi.mocked(dependencies.authorizeWorkspace).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  expect(await call("search_workspace", { query: "launch" })).toMatchObject({
    error: { code: "SOURCE_UNAVAILABLE" },
  });
  expect(dependencies.search).not.toHaveBeenCalled();
  expect(state.knowledge!.unavailable).toEqual([]);
  await call("search_workspace", { query: "launch" });
  vi.mocked(dependencies.document).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  expect(await call("read_page", { pageId: "found-page" })).toMatchObject({
    error: { code: "SOURCE_UNAVAILABLE" },
  });
  expect(state.context.manifest).toEqual([]);
});

test("search failure creates no discovered grants and shares the run's tool budget", async () => {
  const { call, dependencies, state } = readFixture();
  const grants = structuredClone(state.grants);
  vi.mocked(dependencies.search).mockRejectedValueOnce(new Error("private database error"));
  const failed = await call("search_workspace", { query: "launch" });
  expect(failed.error.code).toBe("READ_FAILED");
  expect(JSON.stringify(failed)).not.toContain("private database error");
  expect(state.grants).toEqual(grants);
  state.calls = 24;
  expect(await call("search_workspace", { query: "launch" })).toMatchObject({
    error: { code: "BUDGET_EXHAUSTED" },
  });
  expect(dependencies.search).toHaveBeenCalledTimes(1);
});

test("database metadata and records have explicit resource identities", async () => {
  const { call } = readFixture();
  const sources = await call("describe_source", { type: "database", id: "db" });
  expect(sources).toMatchObject({
    databaseId: "db",
    entries: [{ kind: "data_source", databaseId: "db", dataSourceId: "source", name: "Tasks" }],
  });
  expect(sources.entries[0]).not.toHaveProperty("id");
  expect(sources.next).toContain("query_records");
  const properties = await call("describe_source", {
    type: "database",
    id: "db",
    dataSourceId: "source",
    section: "properties",
  });
  expect(properties.entries[0]).toMatchObject({ kind: "property", propertyId: "source" });
  const records = await call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(records.records[0]).toMatchObject({
    kind: "record",
    recordId: "row",
    pageId: "row-page",
    databaseId: "db",
    dataSourceId: "source",
  });
  expect(records.records[0]).not.toHaveProperty("id");
});

test("progress identifies the source while running and after completion without extra reads", async () => {
  const fixture = readFixture();
  const snapshots: unknown[] = [];
  const tools = createReadTools(fixture.context, fixture.state, {
    signal: fixture.signal,
    maxCalls: 24,
    maxResultBytes: 6000,
    dependencies: fixture.dependencies,
    changed: async () => {
      snapshots.push(structuredClone(fixture.state.progress.activities));
    },
  });
  await tools.read_page.execute!(
    { pageId: "page", cursor: null },
    {
      toolCallId: "read-page",
      messages: [],
      abortSignal: fixture.signal,
      context: {},
    },
  );
  expect(snapshots).toMatchObject([
    [{ source: { type: "page", id: "page" }, status: "running" }],
    [{ source: { type: "page", id: "page" }, status: "completed" }],
  ]);
  expect(fixture.dependencies.document).toHaveBeenCalledTimes(1);
  await fixture.call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(fixture.state.progress.activities.at(-1)?.source).toEqual({
    type: "database",
    id: "db",
    dataSourceId: "source",
  });
});

test("guessed IDs are denied; links become readable only after discovery", async () => {
  const { call, dependencies } = readFixture();
  expect(await call("read_page", { pageId: "linked" })).toMatchObject({
    error: { code: expect.stringContaining("OUT_OF_SCOPE") },
  });
  expect(dependencies.document).not.toHaveBeenCalled();
  expect(await call("read_page", { pageId: "page" })).toMatchObject({
    entries: [{ kind: "reference" }],
  });
  expect(await call("read_page", { pageId: "linked" })).toMatchObject({
    entries: [{ text: "Private linked content" }],
  });
  expect(
    await call("query_records", { databaseId: "other", dataSourceId: "source" }),
  ).toMatchObject({ error: { code: expect.stringContaining("OUT_OF_SCOPE") } });
  expect(dependencies.query).not.toHaveBeenCalled();
});

test("pagination binds the query and revision; rows discover their page bodies", async () => {
  const { call, dependencies, state } = readFixture();
  const first = await call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(first).toMatchObject({ coverage: { complete: false, returned: 1, total: null } });
  const cursor = first.continuation.nextCursor;
  expect(typeof cursor).toBe("string");
  expect(
    await call("query_records", {
      databaseId: "db",
      dataSourceId: "source",
      nameContains: "changed",
      cursor,
    }),
  ).toMatchObject({ error: { code: expect.stringContaining("INVALID_CURSOR") } });
  await call("query_records", { databaseId: "db", dataSourceId: "source", cursor });
  expect(dependencies.query).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ databaseId: "db" }),
    { id: "row", value: "row" },
    { database: 1, source: 1 },
  );
  expect(await call("read_page", { pageId: "row-page" })).toMatchObject({
    coverage: { complete: true },
  });
  expect(state.progress.canContinue).toBe(true);
});

test("revoked parent access blocks a previously discovered page", async () => {
  const { call, dependencies } = readFixture();
  await call("query_records", { databaseId: "db", dataSourceId: "source" });
  vi.mocked(dependencies.authorizeDatabase).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  expect(await call("read_page", { pageId: "row-page" })).toMatchObject({
    error: { code: "SOURCE_UNAVAILABLE" },
  });
  expect(dependencies.document).not.toHaveBeenCalled();
});

test("expired cursors fail without a source query", async () => {
  const { call, state, dependencies } = readFixture();
  const first = await call("query_records", { databaseId: "db", dataSourceId: "source" });
  state.cursors[first.continuation.nextCursor]!.expiresAt = 0;
  vi.mocked(dependencies.query).mockClear();
  expect(
    await call("query_records", {
      databaseId: "db",
      dataSourceId: "source",
      cursor: first.continuation.nextCursor,
    }),
  ).toMatchObject({ error: { code: expect.stringContaining("CURSOR_EXPIRED") } });
  expect(dependencies.query).not.toHaveBeenCalled();
});

test("concurrent calls cannot overrun the tool budget or three active reads", async () => {
  const fixture = readFixture();
  const tools = createReadTools(fixture.context, fixture.state, {
    signal: fixture.signal,
    maxCalls: 3,
    maxResultBytes: 6000,
    dependencies: fixture.dependencies,
  });
  let running = 0,
    maximum = 0;
  vi.mocked(fixture.dependencies.document).mockImplementation(async () => {
    running++;
    maximum = Math.max(maximum, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return { title: "Page", revision: "1", entries: [], offset: 0, hasMore: false };
  });
  const execute = tools.read_page.execute!;
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      execute(
        { pageId: "page", cursor: null },
        { toolCallId: String(i), messages: [], abortSignal: fixture.signal, context: {} },
      ),
    ),
  );
  expect(fixture.dependencies.document).toHaveBeenCalledTimes(3);
  expect(maximum).toBeLessThanOrEqual(3);
  expect(results.filter((r) => !!r && typeof r === "object" && "error" in r)).toHaveLength(5);
});

test("exact counts use an aggregate operation rather than sampled record pages", async () => {
  const { call, dependencies } = readFixture();
  expect(
    await call("aggregate_records", {
      databaseId: "db",
      dataSourceId: "source",
      operation: "count",
    }),
  ).toMatchObject({ value: 800, coverage: { complete: true } });
  expect(dependencies.query).not.toHaveBeenCalled();
});

test("paging beyond 200 record references keeps a bounded working set without imposing a record ceiling", async () => {
  const { call, state, dependencies } = readFixture();
  for (let i = 0; i < 210; i++)
    state.grants.push({
      resource: { type: "page", id: `old-${i}` },
      parent: { type: "database", id: "db" },
    });
  // Start at the supported working-set bound, with earlier record references retained.
  state.grants.splice(2, 12);
  expect(state.grants).toHaveLength(200);
  const result = await call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(result).toMatchObject({ coverage: { returned: 1 } });
  expect(state.grants).toHaveLength(200);
  expect(state.grants.some((g) => g.resource.id === "row-page")).toBe(true);
  expect(state.grants.some((g) => g.resource.id === "db")).toBe(true);
  expect(dependencies.query).toHaveBeenCalledOnce();
});

test("raw tool log contains the exact selected input and result without leaking them into progress", async () => {
  const { state, call } = readFixture();
  await call("read_page", { pageId: "page" });
  const result = await call("read_page", { pageId: "linked" });
  const events = state.debug!.events;
  expect(events.map((event) => event.type)).toEqual([
    "tool.call",
    "tool.result",
    "tool.call",
    "tool.result",
  ]);
  expect(JSON.parse(events[2]!.payload)).toEqual({ pageId: "linked", cursor: null });
  expect(JSON.parse(events[3]!.payload)).toEqual(result);
  expect(events[3]).toMatchObject({ tool: "read_page", toolCallId: "tool-1", step: 1 });
  expect(events[3]!.durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(state.progress)).not.toContain("Private linked content");
});

test("failed authorized reads log the same safe error returned to the model", async () => {
  const { state, call, dependencies } = readFixture();
  vi.mocked(dependencies.document).mockRejectedValueOnce(
    new ServerOperationError({ error: "Private internal failure" }, 403),
  );
  const result = await call("read_page", { pageId: "page" });
  expect(result.error.code).toBe("SOURCE_UNAVAILABLE");
  expect(JSON.parse(state.debug!.events.at(-1)!.payload)).toEqual(result);
  expect(JSON.stringify(state.debug)).not.toContain("Private internal failure");
});

test("a text reference cannot bypass page authorization or produce citation evidence on failure", async () => {
  const { call, dependencies, state } = readFixture();
  vi.mocked(dependencies.document).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  expect(await call("read_page", { pageId: "page" })).toMatchObject({
    error: { code: "SOURCE_UNAVAILABLE" },
  });
  expect(dependencies.document).toHaveBeenCalledWith(
    expect.objectContaining({ pinnedWorkspaceId: "workspace" }),
    expect.objectContaining({ pageId: "page" }),
  );
  expect(state.context.manifest).toEqual([]);
});

test("cached metadata revalidates revision, records reuse and stops inspection loops", async () => {
  const { call, state, dependencies } = readFixture();
  const input = { type: "database", id: "db" };
  await call("describe_source", input);
  for (let i = 0; i < 3; i++)
    expect(await call("describe_source", input)).toMatchObject({ cached: true });
  expect(dependencies.describe).toHaveBeenCalledTimes(1);
  expect(dependencies.metadataRevision).toHaveBeenCalledTimes(3);
  expect(state.progress.activities.at(-1)).toMatchObject({ cached: true });
  expect(state.progress.stopReason).toBe("no_progress");
  expect(state.progress.canContinue).toBe(true);
  vi.mocked(dependencies.metadataRevision!).mockResolvedValueOnce("v2");
  vi.mocked(dependencies.describe).mockResolvedValueOnce({
    title: "Changed",
    revision: "v2",
    section: "sources",
    entries: [],
    hasMore: false,
  });
  expect(await call("describe_source", input)).toMatchObject({ title: "Changed", entries: [] });
  expect(dependencies.describe).toHaveBeenCalledTimes(2);
  expect(state.knowledge!.sources).toHaveLength(0);
});

test("known source IDs receive an authorized correction without becoming page grants", async () => {
  const { call, state, dependencies } = readFixture();
  await call("describe_source", { type: "database", id: "db" });
  expect(await call("read_page", { pageId: "source" })).toMatchObject({
    error: { code: "RESOURCE_TYPE_MISMATCH" },
    next: { tool: "query_records", input: { databaseId: "db", dataSourceId: "source" } },
  });
  expect(dependencies.document).not.toHaveBeenCalled();
  expect(state.grants.some((entry) => entry.resource.id === "source")).toBe(false);
  vi.mocked(dependencies.authorizeDatabase).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  const denied = await call("read_page", { pageId: "source" });
  expect(denied).toMatchObject({ error: { code: "SOURCE_UNAVAILABLE" } });
  expect(denied).not.toHaveProperty("next");
  expect(await call("read_page", { pageId: "unknown" })).toMatchObject({
    error: { code: "OUT_OF_SCOPE" },
  });
});

test("revoked metadata is forgotten and denied pending reads cannot be continued", async () => {
  const { call, state, dependencies } = readFixture();
  await call("describe_source", { type: "database", id: "db" });
  await call("query_records", { databaseId: "db", dataSourceId: "source" });
  expect(Object.keys(state.pending)).toHaveLength(1);
  vi.mocked(dependencies.metadataRevision!).mockRejectedValueOnce(
    new ServerOperationError({ error: "Forbidden" }, 403),
  );
  expect(await call("describe_source", { type: "database", id: "db" })).toMatchObject({
    error: { code: "SOURCE_UNAVAILABLE" },
  });
  expect(state.knowledge!.inspections).toHaveLength(0);
  expect(state.knowledge!.sources).toHaveLength(0);
  expect(Object.keys(state.pending)).toHaveLength(0);
  expect(Object.keys(state.cursors)).toHaveLength(0);
  expect(state.progress.canContinue).toBe(false);
});

test("semantic unavailability is explicit and AI can independently choose keyword search", async () => {
  const { call, dependencies, state } = readFixture();
  const metadata = {
    mode: "semantic" as const,
    indexAvailability: "ready" as const,
    degradationReason: "provider_timeout" as const,
  };
  vi.mocked(dependencies.search).mockResolvedValueOnce({ results: [], metadata });
  expect(await call("semantic_search_workspace", { query: "launch" })).toMatchObject({
    results: [],
    searchMetadata: metadata,
  });
  expect(dependencies.search).toHaveBeenCalledTimes(1);
  expect(state.grants.some((entry) => entry.resource.id === "found-page")).toBe(false);
  expect((await call("search_workspace", { query: "launch" })).results).toHaveLength(2);
  expect(vi.mocked(dependencies.search).mock.calls.map(([, input]) => input.mode)).toEqual([
    "semantic",
    "keyword",
  ]);
});

test("AI can use keyword and semantic tools in one run with independent result orders", async () => {
  const { call, dependencies, state } = readFixture();
  const matches = (await dependencies.search({} as never, {})).results.map((match, index) => ({
    ...match,
    type: "page" as const,
    id: index === 0 ? "found-page" : "other-page",
  }));
  vi.mocked(dependencies.search).mockClear();
  vi.mocked(dependencies.search)
    .mockResolvedValueOnce({ results: matches })
    .mockResolvedValueOnce({ results: [...matches].reverse() });
  const keyword = await call("search_workspace", { query: "launch" });
  const semantic = await call("semantic_search_workspace", { query: "release plans" });
  expect(keyword.results.map((r: { id: string }) => r.id)).toEqual(["found-page", "other-page"]);
  expect(semantic.results.map((r: { id: string }) => r.id)).toEqual(["other-page", "found-page"]);
  expect(vi.mocked(dependencies.search).mock.calls.map(([, input]) => input)).toEqual([
    { workspaceId: "workspace", q: "launch", types: "", mode: "keyword", limit: 10 },
    {
      workspaceId: "workspace",
      q: "release plans",
      types: "",
      mode: "semantic",
      purpose: "question_answering",
      limit: 10,
    },
  ]);
  expect(state.calls).toBe(2);
  expect(state.progress.activities).toMatchObject([
    {
      name: "search_workspace",
      query: "launch",
      label: "Searching workspace by keyword",
      status: "completed",
    },
    {
      name: "semantic_search_workspace",
      query: "release plans",
      label: "Searching workspace by meaning",
      status: "completed",
    },
  ]);
  expect(state.progress.activities.every((activity) => activity.source === undefined)).toBe(true);
  expect(state.context.manifest).toEqual([]);
});

test("semantic schema accepts questions and page filters without a mode or workspace override", () => {
  const schema = readToolSchemas.semantic_search_workspace;
  expect(schema.parse({ query: " What blocks the launch? " })).toEqual({
    query: "What blocks the launch?",
    types: [],
    limit: 10,
  });
  expect(schema.parse({ query: "launch", types: ["page"] }).types).toEqual(["page"]);
  for (const input of [
    { query: " " },
    { query: "x".repeat(513) },
    { query: "launch", types: ["database"] },
    { query: "launch", mode: "keyword" },
    { query: "launch", workspaceId: "other" },
  ])
    expect(schema.safeParse(input).success).toBe(false);
});

for (const name of ["search_workspace", "semantic_search_workspace"] as const)
  test(`${name} requires current access and shares the run tool budget`, async () => {
    const { call, dependencies, state } = readFixture();
    const grants = structuredClone(state.grants);
    vi.mocked(dependencies.authorizeWorkspace).mockRejectedValueOnce(
      new ServerOperationError({ error: "Forbidden" }, 403),
    );
    expect(await call(name, { query: "launch" })).toMatchObject({
      error: { code: "SOURCE_UNAVAILABLE" },
    });
    expect(dependencies.search).not.toHaveBeenCalled();
    expect(state.grants).toEqual(grants);
    state.calls = 24;
    expect(await call(name, { query: "launch" })).toMatchObject({
      error: { code: "BUDGET_EXHAUSTED" },
    });
    expect(dependencies.search).not.toHaveBeenCalled();
  });

test("user lookup supplies filter IDs without granting resources or evidence", async () => {
  const { call, dependencies, state } = readFixture();
  const result = await call("search_workspace", { queryType: "user", query: "Ada" });
  expect(result).toMatchObject({ type: "user_search", users: [{ id: "ada" }], exhaustive: false });
  expect(dependencies.search).not.toHaveBeenCalled();
  expect(state.context.manifest).toEqual([]);
  expect(await call("read_page", { pageId: "ada" })).toMatchObject({
    error: { code: "OUT_OF_SCOPE" },
  });
  await call("search_workspace", {
    filters: { createdByUserIds: ["ada"], editedByUserIds: ["me"] },
    sort: "last_edited_desc",
    limit: 4,
  });
  expect(dependencies.search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      q: "",
      filters: { createdByUserIds: ["ada"], editedByUserIds: ["me"] },
      sort: "last_edited_desc",
      limit: 4,
    }),
  );
});
test("structured filters never extend semantic search or permit user/content mixtures", () => {
  expect(
    readToolSchemas.semantic_search_workspace.safeParse({
      query: "ideas",
      filters: { titleOnly: true },
    }).success,
  ).toBe(false);
  expect(
    readToolSchemas.search_workspace.safeParse({ queryType: "user", query: "Ada", filters: {} })
      .success,
  ).toBe(false);
  expect(readToolSchemas.search_workspace.safeParse({ query: "", types: ["page"] }).success).toBe(
    true,
  );
});
test("keyword search returns attribution and verification without making evidence", async () => {
  const { call, dependencies, state } = readFixture();
  const original = await dependencies.search({} as never, {});
  vi.mocked(dependencies.search).mockResolvedValue({
    ...original,
    results: original.results.map((r) => ({
      ...r,
      createdAt: "2026-01-01T00:00:00Z",
      createdById: "ada",
      lastEditedAt: "2026-02-01T00:00:00Z",
      lastEditedById: "ada",
      verification: {
        state: "expired",
        verifiedAt: "2026-01-01T00:00:00Z",
        verifiedById: "ada",
        expiresAt: "2026-02-01T00:00:00Z",
        revision: "v1",
      },
    })),
  });
  expect(await call("search_workspace", { query: "launch" })).toMatchObject({
    type: "workspace_search",
    results: [
      { lastEditedById: "ada", verification: { state: "expired" } },
      { verification: { state: "expired" } },
    ],
  });
  expect(state.context.manifest).toEqual([]);
});

test("live page verification is returned with the successful read evidence", async () => {
  const { call, dependencies } = readFixture();
  const saved = await dependencies.document({} as never, { pageId: "page" });
  const verification = {
    state: "verified" as const,
    verifiedAt: "2026-01-01T00:00:00.000Z",
    verifiedById: "actor",
    expiresAt: null,
    revision: "2026-01-01T00:00:00.000Z",
  };
  vi.mocked(dependencies.document).mockResolvedValue({ ...saved, verification });
  expect(await call("read_page", { pageId: "page" })).toMatchObject({
    verification,
    evidence: ["[[page:page]]"],
  });
});
