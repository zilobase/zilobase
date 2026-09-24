import { beforeEach, describe, expect, it, vi } from "vitest";
import { discoverConnectionTools, executeMcpTool } from "./mcp-client";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as Record<string, unknown>[],
  member: vi.fn(),
  allowed: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  call: vi.fn(),
  list: vi.fn(),
  decrypt: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@modelcontextprotocol/client", async (original) => ({
  ...(await original<typeof import("@modelcontextprotocol/client")>()),
  Client: class {
    connect = state.connect;
    close = state.close;
    callTool = state.call;
    listTools = state.list;
  },
  StreamableHTTPClientTransport: class {},
  isInputRequiredResult: (result: { inputRequired?: boolean }) => result.inputRequired === true,
}));
vi.mock("../../../access", () => ({ getMembership: state.member }));
vi.mock("../connections/credential-crypto", () => ({ decryptMcpSecret: state.decrypt }));
vi.mock("../connections/oauth-credentials", () => ({
  refreshStoredMcpOAuthCredential: state.refresh,
}));
vi.mock("../execution/mcp-execution-context", () => ({
  isMcpExecutionContextAllowed: state.allowed,
}));
vi.mock("./secure-egress", () => ({ createSecureMcpFetch: () => vi.fn() }));
vi.mock("../../../../infrastructure/database", () => {
  function query() {
    const q = {
      from: () => q,
      innerJoin: () => q,
      where: () => q,
      limit: () => q,
      then: (resolve: (value: unknown) => unknown) => resolve(state.rows.shift() ?? []),
    };
    return q;
  }
  const db = {
    select: query,
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.writes.push(value);
        return { where: async () => undefined };
      },
    }),
    insert: () => ({
      values: async (value: Record<string, unknown>) => {
        state.writes.push(value);
      },
    }),
    transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> => callback(db),
  };
  return { db };
});

const connection = {
  id: "connection",
  scopeType: "personal",
  scopeUserId: "user",
  workspaceId: "workspace",
  authenticatedByUserId: "user",
  state: "connected",
  endpointUrl: "https://example.com/mcp",
  serverLabel: "Fixture",
  alwaysAllowEnabled: false,
};
const snapshot = {
  schemaHash: "schema",
  classification: "read",
  executionMode: "automatic",
};
const input = {
  env: {},
  connectionId: "connection",
  workspaceId: "workspace",
  userId: "user",
  threadId: "thread",
  scope: { type: "personal" as const, userId: "user" },
  externalName: "get_me",
  schemaHash: "schema",
  toolInput: { name: "fixture" },
  expectedPolicy: { ...snapshot, alwaysAllowEnabled: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [[{ connection, credential: {} }], [snapshot]];
  state.writes = [];
  state.member.mockResolvedValue({ role: "member" });
  state.allowed.mockResolvedValue(true);
  state.connect.mockResolvedValue(undefined);
  state.close.mockResolvedValue(undefined);
  state.call.mockResolvedValue({
    content: [{ type: "text", text: "fixture data" }],
  });
  state.list.mockResolvedValue({ tools: [] });
  state.decrypt.mockResolvedValue(
    JSON.stringify({
      kind: "headers",
      headers: [{ name: "authorization", value: "fixture-token" }],
    }),
  );
});

describe("short-lived MCP client", () => {
  it("normalizes results, passes bounded cancellation, and closes the client", async () => {
    const result = await executeMcpTool(input);
    expect(result).toMatchObject({
      ok: true,
      data: { text: "fixture data", untrustedExternalContent: true },
    });
    expect(state.call).toHaveBeenCalledWith(
      { name: "get_me", arguments: { name: "fixture" } },
      { signal: expect.any(AbortSignal) },
    );
    expect(state.close).toHaveBeenCalledOnce();
  });
  it("requires exactly one execution context", async () => {
    expect(await executeMcpTool({ ...input, threadId: undefined })).toMatchObject({
      error: { code: "mcp_context_invalid" },
    });
    expect(await executeMcpTool({ ...input, agentRunId: "run" })).toMatchObject({
      error: { code: "mcp_context_invalid" },
    });
    expect(state.connect).not.toHaveBeenCalled();
  });
  it("honors the emergency switch before loading credentials", async () => {
    expect(
      await executeMcpTool({
        ...input,
        env: { AI_MCP_EXECUTION_DISABLED: "true" },
      }),
    ).toMatchObject({ error: { code: "mcp_execution_disabled" } });
    expect(state.decrypt).not.toHaveBeenCalled();
  });
  it("does not cross workspace or scope boundaries", async () => {
    expect(await executeMcpTool({ ...input, workspaceId: "other" })).toMatchObject({
      error: { code: "mcp_connection_forbidden" },
    });
    state.rows = [[{ connection, credential: {} }]];
    expect(
      await executeMcpTool({
        ...input,
        scope: { type: "personal", userId: "other" },
      }),
    ).toMatchObject({ error: { code: "mcp_connection_forbidden" } });
  });
  it.each([{ classification: "write" }, { executionMode: "always_ask" }])(
    "rejects a policy changed after selection: %j",
    async (change) => {
      state.rows = [[{ connection, credential: {} }], [{ ...snapshot, ...change }]];
      expect(await executeMcpTool(input)).toMatchObject({
        error: { code: "mcp_policy_changed" },
      });
      expect(state.call).not.toHaveBeenCalled();
    },
  );
  it("rejects changed schemas and revoked execution access", async () => {
    state.rows = [[{ connection, credential: {} }], [{ ...snapshot, schemaHash: "changed" }]];
    expect(await executeMcpTool(input)).toMatchObject({
      error: { code: "mcp_tool_changed" },
    });
    state.rows = [[{ connection, credential: {} }], [snapshot]];
    state.allowed.mockResolvedValueOnce(false);
    expect(await executeMcpTool(input)).toMatchObject({
      error: { code: "mcp_context_forbidden" },
    });
  });
  it("retries transient reads but never ambiguous writes", async () => {
    state.call.mockRejectedValueOnce(new TypeError("network"));
    expect((await executeMcpTool(input)).ok).toBe(true);
    expect(state.call).toHaveBeenCalledTimes(2);
    state.call.mockReset().mockRejectedValue(new TypeError("network"));
    state.rows = [[{ connection, credential: {} }], [{ ...snapshot, classification: "write" }]];
    expect(
      await executeMcpTool({
        ...input,
        expectedPolicy: { ...input.expectedPolicy, classification: "write" },
      }),
    ).toMatchObject({
      error: { code: "mcp_write_outcome_unknown", retryable: false },
    });
    expect(state.call).toHaveBeenCalledOnce();
  });
  it("does not expose raw provider failures", async () => {
    state.call.mockRejectedValueOnce(new Error("sensitive provider payload"));
    expect(JSON.stringify(await executeMcpTool(input))).not.toContain("sensitive");
    expect(state.writes.at(-1)).toMatchObject({ state: "degraded" });
  });
  it("rejects interactive input and tolerates cleanup failure", async () => {
    state.call.mockResolvedValueOnce({ inputRequired: true });
    state.close.mockRejectedValueOnce(new Error("cleanup"));
    expect(await executeMcpTool(input)).toMatchObject({
      error: { code: "mcp_input_required" },
    });
  });
  it("closes failed connection attempts", async () => {
    state.connect.mockRejectedValueOnce(new Error("handshake"));
    await expect(executeMcpTool(input)).rejects.toThrow("handshake");
    expect(state.close).toHaveBeenCalledOnce();
  });
  it("requires reconnect after the credential owner leaves", async () => {
    state.member.mockResolvedValueOnce(null);
    await expect(executeMcpTool(input)).rejects.toThrow("no longer active");
    expect(state.writes[0]).toMatchObject({
      lastErrorCode: "authenticator_inactive",
    });
  });
  it("refreshes expiring OAuth credentials and fails closed if refresh fails", async () => {
    state.decrypt.mockResolvedValue(
      JSON.stringify({
        kind: "oauth",
        refreshToken: "refresh",
        expiresAt: "2000-01-01",
        accessToken: "old",
      }),
    );
    state.refresh.mockResolvedValueOnce({ kind: "oauth", accessToken: "new" });
    expect((await executeMcpTool(input)).ok).toBe(true);
    state.rows = [[{ connection, credential: {} }]];
    state.refresh.mockRejectedValueOnce(new Error("denied"));
    await expect(executeMcpTool(input)).rejects.toThrow("reconnect");
  });
  it("stages bounded structured data and omits raw images from persistence", async () => {
    state.call.mockResolvedValueOnce({
      content: [
        { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
        {
          type: "resource_link",
          uri: "https://example.com/item",
          name: "Item",
        },
      ],
      structuredContent: {
        items: [
          { name: "first", nested: { a: 1 } },
          { name: "second", nested: null },
        ],
      },
    });
    const result = await executeMcpTool(input);
    expect(result).toMatchObject({
      citations: [{ source: "external" }],
      data: {
        dataset: { rowCount: 2 },
        images: [{ omittedFromPersistence: true }],
      },
    });
    expect(state.writes[0]).toMatchObject({
      threadId: "thread",
      agentRunId: null,
      scopeType: "personal",
      scopeUserId: "user",
      rowCount: 2,
    });
    expect(JSON.stringify(state.writes)).not.toContain("aGVsbG8=");
  });
  it("discovers tools disabled by default and uses conservative write classifications", async () => {
    state.rows = [[{ connection, credential: {} }], [], []];
    state.list.mockResolvedValueOnce({
      tools: [
        {
          name: "read",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
        },
        { name: "unknown", inputSchema: { type: "object" } },
      ],
    });
    expect(await discoverConnectionTools({ connectionId: "connection", env: {} })).toBe(2);
    expect(state.writes[1]).toMatchObject({
      classification: "read",
      executionMode: "automatic",
      enabled: false,
    });
    expect(state.writes[2]).toMatchObject({
      classification: "unknown",
      executionMode: "always_ask",
      enabled: false,
    });
  });
  it("disables a tool whose schema changed during rediscovery", async () => {
    state.rows = [
      [{ connection, credential: {} }],
      [{ id: "tool", schemaHash: "old", enabled: true }],
    ];
    state.list.mockResolvedValueOnce({
      tools: [{ name: "read", inputSchema: { type: "object" } }],
    });
    await discoverConnectionTools({ connectionId: "connection", env: {} });
    expect(state.writes[1]).toMatchObject({ enabled: false, available: true });
  });
  it("bounds discovery and closes the failed client", async () => {
    state.rows = [[{ connection, credential: {} }]];
    state.list.mockResolvedValueOnce({
      tools: Array(1001).fill({ name: "tool" }),
    });
    await expect(discoverConnectionTools({ connectionId: "connection", env: {} })).rejects.toThrow(
      "too many",
    );
    expect(state.close).toHaveBeenCalledOnce();
  });
});
