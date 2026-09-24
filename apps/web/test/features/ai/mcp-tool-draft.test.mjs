export function register({ assert, loadModule, test }) {
  test("draft MCP policies default to disabled and always ask, preserving staged choices", async () => {
    const { changeDraftToolPolicy, savedToolPolicy } = await loadModule(
      "/src/features/ai/settings/model/mcp-tool-draft.ts",
    );
    const tool = {
      id: "tool",
      classification: "write",
      enabled: true,
      executionMode: "always_allow",
    };
    assert.deepEqual(changeDraftToolPolicy([], tool, {}), [
      {
        toolId: "tool",
        classification: "write",
        enabled: false,
        executionMode: "always_ask",
      },
    ]);
    const tools = [
      {
        toolId: "tool",
        classification: "read",
        enabled: true,
        executionMode: "always_allow",
      },
      { toolId: "other" },
    ];
    const changed = changeDraftToolPolicy(tools, tool, { enabled: false });
    assert.equal(changed[0], tools[1]);
    assert.deepEqual(changed[1], {
      toolId: "tool",
      classification: "read",
      enabled: false,
      executionMode: "always_allow",
    });
    assert.equal(tools[0].enabled, true);
    assert.deepEqual(savedToolPolicy(tool, { enabled: false }), {
      toolId: "tool",
      classification: "write",
      enabled: false,
      executionMode: "always_allow",
    });
  });
  test("MCP policy controls require connection management and draft or authenticator ownership", async () => {
    const { canEditMcpToolPolicy } = await loadModule(
      "/src/features/ai/settings/model/mcp-tool-draft.ts",
    );
    assert.equal(canEditMcpToolPolicy(false, false, true), false);
    assert.equal(canEditMcpToolPolicy(true, false, true), true);
    assert.equal(canEditMcpToolPolicy(false, true, true), true);
    assert.equal(canEditMcpToolPolicy(true, true, false), false);
  });
  test("connector review highlighting compares only reviewed connector definitions", async () => {
    const { isConnectorDraftChanged } = await loadModule(
      "/src/features/ai/settings/model/mcp-tool-draft.ts",
    );
    const selected = { connectionId: "connection", tools: [] };
    assert.equal(isConnectorDraftChanged(undefined, "connection", selected), undefined);
    const review = {
      fields: ["connectors"],
      before: { connectors: [selected] },
    };
    assert.equal(
      isConnectorDraftChanged(review, "connection", structuredClone(selected)),
      undefined,
    );
    assert.equal(isConnectorDraftChanged(review, "connection", undefined), true);
    assert.equal(
      isConnectorDraftChanged({ ...review, fields: [] }, "connection", undefined),
      undefined,
    );
  });
}
