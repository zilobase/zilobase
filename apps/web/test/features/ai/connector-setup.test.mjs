export function register({ assert, loadModule, test }) {
  test("connector setup distinguishes catalog identity from approved server endpoint identity", async () => {
    const { describeConnectorSetup } = await loadModule(
      "/src/features/ai/settings/model/connector-setup.ts",
    );
    const catalog = [{ id: "tool", label: "Tools", available: true, availabilityReason: null }];
    const connections = [
      {
        id: "saved",
        catalogId: "tool",
        endpointUrl: "https://tools.test",
        state: "connected",
      },
    ];
    const catalogState = describeConnectorSetup({
      provider: "tool",
      scope: "personal",
      catalog,
      connections,
    });
    assert.equal(catalogState.existing, connections[0]);
    assert.equal(catalogState.label, "Tools");
    assert.equal(catalogState.connected, true);
    const approved = describeConnectorSetup({
      provider: "approved:server",
      scope: "agent",
      approved: [{ id: "server", label: "Approved", endpointUrl: "https://tools.test" }],
      connections,
    });
    assert.equal(approved.approvedId, "server");
    assert.equal(approved.existing, connections[0]);
    assert.equal(approved.unavailable, false);
    const unknown = describeConnectorSetup({
      provider: "unknown",
      scope: "personal",
    });
    assert.equal(unknown.label, "unknown");
    assert.equal(unknown.unavailable, true);
    const unavailable = describeConnectorSetup({
      provider: "tool",
      scope: "personal",
      catalog: [
        {
          ...catalog[0],
          available: false,
          availabilityReason: "Disabled here",
        },
      ],
    });
    assert.equal(unavailable.description, "Disabled here");
  });
  test("connector actions enforce actor roles and prevent reconnecting while busy", async () => {
    const { connectorActionState } = await loadModule(
      "/src/features/ai/settings/model/connector-setup.ts",
    );
    const setup = { connected: false, unavailable: false, label: "Tools" };
    assert.deepEqual(connectorActionState(setup, "personal", undefined, false), {
      disabled: false,
      label: "Connect Tools",
    });
    for (const role of ["owner", "editor"])
      assert.equal(connectorActionState(setup, "agent", role, false).disabled, false);
    for (const role of ["viewer", undefined])
      assert.equal(connectorActionState(setup, "agent", role, false).disabled, true);
    assert.deepEqual(connectorActionState(setup, "personal", undefined, true), {
      disabled: true,
      label: "Connecting…",
    });
    assert.deepEqual(
      connectorActionState({ ...setup, connected: true }, "personal", undefined, true),
      { disabled: true, label: "Connected" },
    );
    assert.equal(
      connectorActionState({ ...setup, unavailable: true }, "personal", undefined, false).disabled,
      true,
    );
  });
}
