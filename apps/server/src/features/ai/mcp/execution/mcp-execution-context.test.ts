import { beforeEach, describe, expect, it, vi } from "vitest";
import { isMcpExecutionContextAllowed } from "./mcp-execution-context";

const { select, limit } = vi.hoisted(() => ({ select: vi.fn(), limit: vi.fn() }));
vi.mock("../../../../infrastructure/database", () => ({ db: { select } }));

const input = {
  connectionId: "connection", externalName: "get_me", schemaHash: "schema",
  env: { AI_MCP_ENABLED: "true", AI_CUSTOM_AGENTS_ENABLED: "true" },
  scope: { type: "personal" as const, userId: "user" },
  threadId: "thread", userId: "user", workspaceId: "workspace",
};

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), limit };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  select.mockReturnValue(query);
  limit.mockResolvedValue([]);
});

describe("MCP execution context", () => {
  it("rejects disabled execution before querying", async () => {
    expect(await isMcpExecutionContextAllowed({ ...input, env: { AI_MCP_ENABLED: "false" } }, "read")).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
  it("requires the personal owner and an existing thread", async () => {
    expect(await isMcpExecutionContextAllowed({ ...input, userId: "other" }, "read")).toBe(false);
    expect(select).not.toHaveBeenCalled();
    expect(await isMcpExecutionContextAllowed(input, "read")).toBe(false);
    limit.mockResolvedValue([{ id: "thread" }]);
    expect(await isMcpExecutionContextAllowed(input, "read")).toBe(true);
  });
  it("requires both deployment and workspace permission for writes", async () => {
    expect(await isMcpExecutionContextAllowed(input, "write")).toBe(false);
    const writeInput = { ...input, env: { ...input.env, AI_MCP_EXTERNAL_WRITES_ENABLED: "true" } };
    limit.mockResolvedValueOnce([{ enabled: false }]);
    expect(await isMcpExecutionContextAllowed(writeInput, "write")).toBe(false);
    limit.mockResolvedValueOnce([{ enabled: true }]).mockResolvedValueOnce([{ id: "thread" }]);
    expect(await isMcpExecutionContextAllowed(writeInput, "write")).toBe(true);
  });
  it("requires the queued run's exact tool grant", async () => {
    const runInput = { ...input, threadId: null, agentRunId: "run", scope: { type: "agent" as const, agentProfileId: "agent" } };
    expect(await isMcpExecutionContextAllowed(runInput, "read")).toBe(false);
    limit.mockResolvedValue([{ permissionSnapshot: { mcpTools: [{
      connectionId: input.connectionId, externalName: input.externalName,
      schemaHash: input.schemaHash, classification: "read", requiresApproval: false,
    }] } }]);
    expect(await isMcpExecutionContextAllowed(runInput, "read")).toBe(true);
    expect(await isMcpExecutionContextAllowed({ ...runInput, externalName: "new_tool" }, "read")).toBe(false);
    expect(await isMcpExecutionContextAllowed({ ...runInput, env: { ...input.env, AI_CUSTOM_AGENT_EXECUTION_DISABLED: "true" } }, "read")).toBe(false);
  });
});
