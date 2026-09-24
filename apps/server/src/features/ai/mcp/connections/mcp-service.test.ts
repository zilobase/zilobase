import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  addApprovedMcpServer,
  createMcpConnection,
  disconnectMcpConnection,
  getMcpConnection,
  getWorkspaceMcpPolicy,
  listMcpActivity,
  listMcpConnections,
  recordMcpActivity,
  refreshMcpConnection,
  removeApprovedMcpServer,
  setMcpAlwaysAllow,
  submitMcpHeaders,
  updateMcpToolPolicies,
  updateWorkspaceMcpPolicy,
} from "./mcp-service";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as Record<string, unknown>[],
  where: [] as unknown[],
  member: vi.fn(),
  discover: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("../../../access", () => ({ getMembership: state.member }));
vi.mock("../transport/mcp-client", () => ({ discoverConnectionTools: state.discover }));
vi.mock("./oauth-credentials", () => ({
  revokeStoredMcpOAuthCredential: state.revoke,
}));
vi.mock("../../../../infrastructure/database", () => {
  function query() {
    const q = {
      from: () => q,
      innerJoin: () => q,
      orderBy: () => q,
      limit: () => q,
      where: (condition: unknown) => {
        state.where.push(condition);
        return q;
      },
      then: (resolve: (value: unknown) => unknown) => resolve(state.rows.shift() ?? []),
    };
    return q;
  }
  const db = {
    select: query,
    delete: () => ({
      where: () => ({ returning: async () => state.rows.shift() ?? [] }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.writes.push(value);
        return { where: async () => undefined };
      },
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        state.writes.push(value);
        const q = {
          returning: async () => [value],
          onConflictDoUpdate: () => q,
          then: (resolve: (value: unknown) => unknown) => resolve([]),
        };
        return q;
      },
    }),
    transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> => callback(db),
  };
  return { db };
});

const input = {
  scope: { type: "personal" as const, userId: "user" },
  userId: "user",
  workspaceId: "workspace",
  connectionId: "connection",
};
const env = {
  MCP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({
    activeVersion: "v1",
    keys: { v1: btoa("x".repeat(32)) },
  }),
};
const connection = {
  id: "connection",
  scopeType: "personal",
  scopeUserId: "user",
  agentProfileId: null,
  authenticatedByUserId: "user",
  authMethod: "headers",
  workspaceId: "workspace",
  serverLabel: "GitHub",
  state: "connected",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  state.rows = [];
  state.writes = [];
  state.where = [];
  vi.clearAllMocks();
  state.member.mockResolvedValue({ role: "member" });
  state.discover.mockResolvedValue(2);
});

describe("MCP connection policy and lifecycle", () => {
  it("defaults workspace writes and custom servers to disabled", async () => {
    expect(await getWorkspaceMcpPolicy("workspace")).toMatchObject({
      externalWritesEnabled: false,
      customServersEnabled: false,
    });
  });
  it("persists workspace policy explicitly", async () => {
    expect(
      await updateWorkspaceMcpPolicy({
        workspaceId: "workspace",
        customServersEnabled: true,
        externalWritesEnabled: false,
        installationPolicy: "approved_only",
      }),
    ).toMatchObject({ installationPolicy: "approved_only" });
  });
  it("normalizes approved HTTPS endpoints and rejects local URLs", async () => {
    expect(
      await addApprovedMcpServer({
        ...input,
        endpointUrl: "https://EXAMPLE.com/mcp",
        label: "Example",
      }),
    ).toMatchObject({ endpointUrl: "https://example.com/mcp" });
    await expect(
      addApprovedMcpServer({
        ...input,
        endpointUrl: "http://localhost/mcp",
        label: "Example",
      }),
    ).rejects.toThrow();
  });
  it("reports whether an approved server was removed", async () => {
    expect(
      await removeApprovedMcpServer({
        serverId: "missing",
        workspaceId: "workspace",
      }),
    ).toBe(false);
    state.rows = [[{ id: "server" }]];
    expect(
      await removeApprovedMcpServer({
        serverId: "server",
        workspaceId: "workspace",
      }),
    ).toBe(true);
  });
  it("creates personal catalog connections without exposing their owner identifier", async () => {
    state.rows = [[{ value: 0 }], []];
    const result = await createMcpConnection({
      ...input,
      env,
      authMethod: "oauth",
      catalogId: "github",
    });
    expect(result.scope).toEqual({ type: "personal" });
    expect(result.agentProfileId).toBeNull();
    expect(JSON.stringify(result)).not.toContain("scopeUserId");
    const quotaSql = new PgDialect().sqlToQuery(state.where[0] as never);
    expect(quotaSql.params).toContain("workspace");
    expect(quotaSql.params).toContain("user");
  });
  it("does not let another user create a personal connection", async () => {
    await expect(
      createMcpConnection({
        ...input,
        userId: "other",
        env,
        authMethod: "oauth",
        catalogId: "github",
      }),
    ).rejects.toThrow("private");
    expect(state.writes).toEqual([]);
  });
  it.each([
    { rows: [[{ value: 10 }]], catalogId: "github", error: "at most 10" },
    { rows: [[], []], catalogId: "missing", error: "unavailable" },
    {
      rows: [[], [{ installationPolicy: "approved_only" }]],
      catalogId: "github",
      error: "explicitly approved",
    },
    { rows: [[], []], catalogId: undefined, error: "Choose a catalog" },
  ])("rejects invalid creation: $error", async ({ rows, catalogId, error }) => {
    state.rows = rows;
    await expect(
      createMcpConnection({ ...input, env, authMethod: "oauth", catalogId }),
    ).rejects.toThrow(error);
  });
  it("requires both deployment and workspace custom-server approval", async () => {
    state.rows = [[], []];
    await expect(
      createMcpConnection({
        ...input,
        env,
        authMethod: "headers",
        approvedServerId: "server",
      }),
    ).rejects.toThrow("disabled");
    state.rows = [
      [],
      [{ customServersEnabled: true }],
      [
        {
          id: "server",
          endpointUrl: "https://example.com/mcp",
          label: "Custom",
        },
      ],
    ];
    expect(
      await createMcpConnection({
        ...input,
        env: { ...env, AI_MCP_CUSTOM_SERVERS_ENABLED: "true" },
        authMethod: "headers",
        approvedServerId: "server",
      }),
    ).toMatchObject({ serverLabel: "Custom" });
  });
  it("rejects credentials changed by someone other than their authenticator", async () => {
    state.rows = [[{ ...connection, authenticatedByUserId: "other" }]];
    await expect(
      submitMcpHeaders({
        ...input,
        env,
        headers: [{ name: "Authorization", value: "Bearer test" }],
      }),
    ).rejects.toThrow("authenticated");
  });
  it.each(
    [
      [],
      [{ name: "Host", value: "example.com" }],
      [{ name: "Authorization", value: "" }],
      [
        { name: "Authorization", value: "one" },
        { name: "authorization", value: "two" },
      ],
    ].map((headers) => ({ headers })),
  )("rejects invalid headers: %j", async ({ headers }) => {
    state.rows = [[connection]];
    await expect(submitMcpHeaders({ ...input, env, headers })).rejects.toThrow();
    expect(state.discover).not.toHaveBeenCalled();
  });
  it("encrypts header values and discovers tools", async () => {
    state.rows = [[connection], [connection], []];
    await submitMcpHeaders({
      ...input,
      env,
      headers: [{ name: "Authorization", value: "Bearer secret-test-value" }],
    });
    expect(JSON.stringify(state.writes)).not.toContain("secret-test-value");
    expect(state.writes.some((write) => typeof write.ciphertext === "string")).toBe(true);
    expect(state.discover).toHaveBeenCalledOnce();
  });
  it("preserves reconnect state when discovery fails", async () => {
    state.discover.mockRejectedValueOnce(new Error("private provider error"));
    state.rows = [[connection], [{ ...connection, state: "reconnect_required" }], []];
    const result = await submitMcpHeaders({
      ...input,
      env,
      headers: [{ name: "Authorization", value: "token" }],
    });
    expect(result.state).toBe("reconnect_required");
    expect(JSON.stringify(state.writes)).not.toContain("private provider error");
  });
  it("requires explicit confirmation to enable Always allow", async () => {
    state.rows = [[connection]];
    await expect(setMcpAlwaysAllow({ ...input, enabled: true, confirmed: false })).rejects.toThrow(
      "confirmation",
    );
    state.rows = [[connection], [connection], []];
    await setMcpAlwaysAllow({ ...input, enabled: true, confirmed: true });
    expect(state.writes[0]).toMatchObject({ alwaysAllowEnabled: true });
  });
  it("refreshes only an owned connection", async () => {
    state.rows = [[connection], [connection], []];
    expect(await refreshMcpConnection({ ...input, env })).toMatchObject({
      discoveredTools: 2,
    });
  });
  it("marks connections for reconnect after the authenticator leaves", async () => {
    state.member.mockResolvedValueOnce({ role: "member" }).mockResolvedValueOnce(null);
    state.rows = [[{ ...connection }], []];
    expect((await listMcpConnections(input))[0]).toMatchObject({
      state: "reconnect_required",
      lastErrorCode: "authenticator_inactive",
    });
  });
  it("rejects unknown tool policies", async () => {
    state.rows = [[connection], []];
    await expect(
      updateMcpToolPolicies({
        ...input,
        policies: [
          {
            toolId: "forged",
            enabled: true,
            executionMode: "automatic",
            classification: "read",
          },
        ],
      }),
    ).rejects.toThrow("unavailable");
  });
  it("enforces the enabled-tool quota before writing", async () => {
    state.rows = [[connection], [{ id: "tool", enabled: false }], [{ value: 100 }]];
    await expect(
      updateMcpToolPolicies({
        ...input,
        policies: [
          {
            toolId: "tool",
            enabled: true,
            executionMode: "automatic",
            classification: "read",
          },
        ],
      }),
    ).rejects.toThrow("100");
  });
  it("updates valid tool policies", async () => {
    state.rows = [[connection], [{ id: "tool", enabled: false }], [{ value: 0 }], [connection], []];
    await updateMcpToolPolicies({
      ...input,
      policies: [
        {
          toolId: "tool",
          enabled: true,
          executionMode: "always_ask",
          classification: "write",
        },
      ],
    });
    expect(state.writes[0]).toMatchObject({
      enabled: true,
      executionMode: "always_ask",
      classification: "write",
    });
  });
  it("deletes locally even if remote OAuth revocation fails", async () => {
    state.rows = [[{ ...connection, authMethod: "oauth" }]];
    state.revoke.mockRejectedValueOnce(new Error("provider offline"));
    expect(await disconnectMcpConnection({ ...input, env })).toBe(true);
    expect(state.revoke).toHaveBeenCalledOnce();
    expect(await disconnectMcpConnection({ ...input, env })).toBe(false);
  });
  it("fails closed for a missing connection or membership", async () => {
    await expect(getMcpConnection(input)).rejects.toThrow("not found");
    state.member.mockResolvedValueOnce(null);
    await expect(getMcpConnection(input)).rejects.toThrow("membership");
  });
  it("sanitizes activity on both write and read", async () => {
    await recordMcpActivity({
      ...input,
      eventType: "tool_invoked",
      outcome: "failed",
      metadata: { token: "secret", classification: "read" },
    });
    expect(JSON.stringify(state.writes)).not.toContain("secret");
    state.rows = [[{ id: "event", createdAt: new Date(), metadata: { token: "secret" } }]];
    expect(JSON.stringify(await listMcpActivity(input))).not.toContain("secret");
  });
});
