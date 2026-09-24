import { describe, expect, it } from "vitest";

import type { aiAgentPendingAction } from "../../../../infrastructure/database/schema";
import { dynamicMcpToolName, executeApprovedMcpAction } from "./mcp-approval";

describe("dynamicMcpToolName", () => {
  it("does not execute queued agent approvals after the emergency switch is enabled", async () => {
    await expect(
      executeApprovedMcpAction({
        action: { agentRunId: "run" } as typeof aiAgentPendingAction.$inferSelect,
        env: { AI_CUSTOM_AGENTS_ENABLED: "true", AI_CUSTOM_AGENT_EXECUTION_DISABLED: "true" },
        userId: "user",
        workspaceId: "workspace",
      }),
    ).rejects.toThrow("Custom Agent execution is disabled");
  });
  it("is deterministic, bounded, and connection scoped", () => {
    const snapshot = { externalName: "Create / update issue" };
    const first = dynamicMcpToolName({ id: "connection-a", serverLabel: "Linear" }, snapshot);
    const repeated = dynamicMcpToolName({ id: "connection-a", serverLabel: "Linear" }, snapshot);
    const otherConnection = dynamicMcpToolName(
      { id: "connection-b", serverLabel: "Linear" },
      snapshot,
    );

    expect(first).toBe(repeated);
    expect(first).not.toBe(otherConnection);
    expect(first).toMatch(/^mcp_linear_create_update_issue_[a-z0-9]{7}$/);
    expect(first.length).toBeLessThanOrEqual(120);
  });
});
