import { beforeEach, describe, expect, it, vi } from "vitest";
import type { aiAgentPendingAction } from "../../../../infrastructure/database/schema";
import { hashAgentToolInput } from "../../actions/agent-action-receipts";
import { encryptMcpSecret } from "../connections/credential-crypto";
import { executeApprovedMcpAction } from "./mcp-approval";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as unknown[],
  access: vi.fn(),
  member: vi.fn(),
  discover: vi.fn(),
  execute: vi.fn(),
  policy: vi.fn(),
  checkpoint: vi.fn(),
}));
vi.mock("../../../access", () => ({ getMembership: state.member }));
vi.mock("../mcp-scope", async (original) => ({
  ...(await original<typeof import("../mcp-scope")>()),
  requireMcpScopeAccess: state.access,
}));
vi.mock("../transport/mcp-client", () => ({
  discoverConnectionTools: state.discover,
  executeMcpTool: state.execute,
}));
vi.mock("../connections/mcp-service", () => ({ getWorkspaceMcpPolicy: state.policy }));
vi.mock("../../execution/agent-run-checkpoint", () => ({
  readAgentRunCheckpoint: state.checkpoint,
}));
vi.mock("../../../../infrastructure/database", () => {
  function query() {
    const q = {
      from: () => q,
      innerJoin: () => q,
      where: () => q,
      limit: () => q,
      then: (resolve: (value: unknown) => unknown) =>
        resolve(state.rows.shift() ?? []),
    };
    return q;
  }
  const db = {
    select: query,
    update: () => ({
      set: (value: unknown) => {
        state.writes.push(value);
        return { where: async () => undefined };
      },
    }),
    transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> =>
      callback(db),
  };
  return { db };
});

const env = {
  AI_CUSTOM_AGENTS_ENABLED: "true",
  AI_MCP_EXTERNAL_WRITES_ENABLED: "true",
  MCP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({
    activeVersion: "v1",
    keys: { v1: btoa("x".repeat(32)) },
  }),
};
const context = {
  connection: {
    id: "connection",
    state: "connected",
    scopeType: "personal",
    scopeUserId: "user",
    authenticatedByUserId: "user",
    workspaceId: "workspace",
    alwaysAllowEnabled: false,
  },
  snapshot: {
    enabled: true,
    available: true,
    schemaHash: "schema",
    externalName: "get_me",
    executionMode: "always_ask",
    classification: "read",
  },
};
const success = {
  ok: true,
  status: "succeeded",
  summary: "Done",
  data: { username: "fixture" },
};
let action: typeof aiAgentPendingAction.$inferSelect;

async function fixture(agent = false) {
  const encrypted = await encryptMcpSecret(
    env,
    JSON.stringify({ owner: "fixture" }),
    {
      authenticatedByUserId: "user",
      connectionId: "connection",
      profileId: agent ? "agent" : "personal:workspace:user",
      purpose: "approval:action",
      workspaceId: "workspace",
    },
  );
  return {
    id: "action",
    agentRunId: agent ? "run" : null,
    agentProfileId: agent ? "agent" : null,
    threadId: agent ? null : "thread",
    connectionId: "connection",
    mcpScopeType: agent ? "agent" : "personal",
    mcpScopeUserId: agent ? null : "user",
    externalToolName: "get_me",
    toolSchemaHash: "schema",
    inputHash: await hashAgentToolInput({ owner: "fixture" }),
    encryptedToolInput: `${encrypted.keyVersion}:${encrypted.ciphertext}`,
    encryptedToolInputIv: encrypted.iv,
    encryptedToolInputAuthTag: encrypted.authTag,
    toolCallId: "call",
    status: "executing",
  } as typeof aiAgentPendingAction.$inferSelect;
}
function execute() {
  return executeApprovedMcpAction({
    action,
    env,
    userId: "user",
    workspaceId: "workspace",
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  state.rows = [];
  state.writes = [];
  action = await fixture();
  state.member.mockResolvedValue({ role: "member" });
  state.execute.mockResolvedValue(success);
  state.policy.mockResolvedValue({ externalWritesEnabled: true });
  state.checkpoint.mockResolvedValue({ toolCallIds: ["call"] });
});

describe("approved MCP execution", () => {
  it("executes exactly the integrity-checked personal tool arguments", async () => {
    state.rows = [
      [{ userId: "user", workspaceId: "workspace" }],
      [context],
      [{ id: "receipt" }],
    ];
    expect(await execute()).toEqual(success);
    expect(state.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        toolInput: { owner: "fixture" },
        toolExecutionId: "receipt",
        threadId: "thread",
      }),
    );
    expect(state.writes[0]).toMatchObject({
      status: "succeeded",
      outcomeUnknown: false,
    });
  });
  it.each([
    "connectionId",
    "externalToolName",
    "toolSchemaHash",
    "encryptedToolInput",
    "encryptedToolInputIv",
    "encryptedToolInputAuthTag",
  ] as const)("rejects missing %s", async (key) => {
    action[key] = null;
    await expect(execute()).rejects.toThrow("incomplete");
    expect(state.execute).not.toHaveBeenCalled();
  });
  it.each([
    { userId: "other", workspaceId: "workspace" },
    { userId: "user", workspaceId: "other" },
  ])("rejects a mismatched thread: %j", async (thread) => {
    state.rows = [[thread]];
    await expect(execute()).rejects.toThrow("chat context");
    expect(state.discover).not.toHaveBeenCalled();
  });
  it.each([
    { enabled: false },
    { available: false },
    { schemaHash: "changed" },
  ])("rejects a changed tool: %j", async (snapshot) => {
    state.rows = [
      [{ userId: "user", workspaceId: "workspace" }],
      [{ ...context, snapshot: { ...context.snapshot, ...snapshot } }],
    ];
    await expect(execute()).rejects.toThrow("changed");
    expect(state.execute).not.toHaveBeenCalled();
  });
  it("rejects an inactive credential owner", async () => {
    state.rows = [
      [{ userId: "user", workspaceId: "workspace" }],
      [context],
    ];
    state.member.mockResolvedValueOnce(null);
    await expect(execute()).rejects.toThrow("no longer active");
  });
  it("rechecks live write policy", async () => {
    state.rows = [
      [{ userId: "user", workspaceId: "workspace" }],
      [
        {
          ...context,
          snapshot: { ...context.snapshot, classification: "write" },
        },
      ],
    ];
    state.policy.mockResolvedValueOnce({ externalWritesEnabled: false });
    await expect(execute()).rejects.toThrow("writes are disabled");
  });
  it("rejects changed encrypted arguments or their hash", async () => {
    state.rows = [
      [{ userId: "user", workspaceId: "workspace" }],
      [context],
    ];
    action.inputHash = "forged";
    await expect(execute()).rejects.toThrow("integrity");
    expect(state.execute).not.toHaveBeenCalled();
  });
  it("records ambiguous write outcomes without declaring success", async () => {
    state.rows = [
      [{ userId: "user", workspaceId: "workspace" }],
      [context],
      [],
    ];
    state.execute.mockResolvedValueOnce({
      ok: false,
      status: "failed",
      summary: "Unknown",
      error: { code: "mcp_write_outcome_unknown" },
    });
    await execute();
    expect(state.writes[0]).toMatchObject({
      status: "failed",
      outcomeUnknown: true,
    });
  });
  it("persists an agent approval result without completing the whole run", async () => {
    action = await fixture(true);
    const agentContext = {
      ...context,
      connection: {
        ...context.connection,
        scopeType: "agent",
        scopeUserId: null,
        agentProfileId: "agent",
      },
    };
    state.rows = [
      [
        {
          id: "run",
          permissionSnapshot: {
            mcpTools: [
              {
                connectionId: "connection",
                externalName: "get_me",
                schemaHash: "schema",
                classification: "read",
                requiresApproval: true,
              },
            ],
          },
        },
      ],
      [agentContext],
      [{ id: "receipt" }],
    ];
    expect(await execute()).toEqual(success);
    expect(state.execute.mock.calls[0]![0].agentRunId).toBe("run");
    expect(state.writes).toHaveLength(2);
    expect(state.writes[1]).toMatchObject({
      result: success,
      status: "succeeded",
    });
    expect(
      state.writes.some((write) => Object.hasOwn(write as object, "output")),
    ).toBe(false);
  });
  it("will not execute an agent approval without its exact saved checkpoint", async () => {
    action = await fixture(true);
    state.rows = [[{ id: "run" }]];
    state.checkpoint.mockResolvedValueOnce({ toolCallIds: [] });
    await expect(execute()).rejects.toThrow("checkpoint");
    expect(state.execute).not.toHaveBeenCalled();
  });
});
