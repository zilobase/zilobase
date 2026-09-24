import { describe, expect, it } from "vitest";
import { findAgentMcpToolGrant } from "./mcp-run-snapshot";

const identity = {
  connectionId: "github",
  externalName: "get_me",
  schemaHash: "schema-v1",
  classification: "read" as const,
};
const permissionSnapshot = { mcpTools: [{ ...identity, requiresApproval: true }], resources: [] };

describe("agent MCP capability snapshots", () => {
  it("retains the captured approval requirement", () => {
    expect(findAgentMcpToolGrant(permissionSnapshot, identity)?.requiresApproval).toBe(true);
  });
  it.each([
    { ...identity, connectionId: "new-connection" },
    { ...identity, externalName: "new-tool" },
    { ...identity, schemaHash: "new-schema" },
    { ...identity, classification: "write" as const },
  ])("does not expand a queued run's capabilities: %j", (changed) => {
    expect(findAgentMcpToolGrant(permissionSnapshot, changed)).toBeUndefined();
  });
  it.each([null, {}, { mcpTools: [] }, { mcpTools: [identity] }])(
    "fails closed for missing or invalid grants: %j",
    (snapshot) => {
      expect(findAgentMcpToolGrant(snapshot, identity)).toBeUndefined();
    },
  );
});
