import { describe, expect, it } from "vitest";

import {
  agentMcpScope,
  getMcpCredentialScopeId,
  getMcpScopeColumns,
  getMcpScopeFromConnection,
  getMcpScopeRef,
  isMcpScopeMatch,
  personalMcpScope,
} from "./mcp-scope";

describe("MCP connection scopes", () => {
  it("binds an agent credential to its workspace and profile", () => {
    const connection = {
      agentProfileId: "agent-1",
      scopeType: "agent",
      scopeUserId: null,
      workspaceId: "workspace-1",
    };

    expect(getMcpScopeFromConnection(connection)).toEqual(agentMcpScope("agent-1"));
    expect(getMcpCredentialScopeId(connection)).toBe("agent:workspace-1:agent-1");
    expect(getMcpScopeRef(agentMcpScope("agent-1"))).toEqual({
      type: "agent",
      agentProfileId: "agent-1",
    });
  });

  it("binds a personal credential to both workspace and user", () => {
    const connection = {
      agentProfileId: null,
      scopeType: "personal",
      scopeUserId: "user-1",
      workspaceId: "workspace-1",
    };

    expect(getMcpScopeFromConnection(connection)).toEqual(personalMcpScope("user-1"));
    expect(getMcpCredentialScopeId(connection)).toBe("personal:workspace-1:user-1");
    expect(getMcpScopeColumns(personalMcpScope("user-1"))).toEqual({
      agentProfileId: null,
      scopeType: "personal",
      scopeUserId: "user-1",
    });
  });

  it("never treats personal and agent scopes as equivalent", () => {
    expect(isMcpScopeMatch(personalMcpScope("same"), agentMcpScope("same"))).toBe(false);
    expect(isMcpScopeMatch(personalMcpScope("one"), personalMcpScope("two"))).toBe(false);
    expect(isMcpScopeMatch(agentMcpScope("one"), agentMcpScope("one"))).toBe(true);
  });

  it("rejects incomplete persisted scope identities", () => {
    expect(() => getMcpScopeFromConnection({
      agentProfileId: null,
      scopeType: "agent",
      scopeUserId: null,
    })).toThrow("invalid scope");
  });
});
