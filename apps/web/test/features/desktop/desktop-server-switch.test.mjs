export function register({ assert, loadModule, test }) {
  test("switch path prefers login when the target has no credentials", async () => {
    const { resolveDesktopServerSwitchPath } = await loadModule(
      "/src/platform/server/desktop-server.ts",
    );

    assert.equal(resolveDesktopServerSwitchPath({ hasCredentials: false }), "/login");
    assert.equal(
      resolveDesktopServerSwitchPath({
        hasCredentials: true,
        path: "/p/page-1",
      }),
      "/p/page-1",
    );
    assert.equal(resolveDesktopServerSwitchPath({}), "/recents");
  });

  test("desktop persist keys stay unscoped without a selected server", async () => {
    const { desktopPersistKey } = await loadModule("/src/platform/server/desktop-server.ts");
    assert.equal(desktopPersistKey("zilobase-app"), "zilobase-app");
    assert.equal(
      desktopPersistKey("zilobase-app", {
        apiOrigin: "https://notes.example.com",
        displayName: "Team Notes",
        instanceId: "instance-1",
        issuer: "https://notes.example.com",
        minimumDesktopVersion: "0.0.30",
        protocolVersion: 1,
        serverVersion: "0.0.30",
        webOrigin: "https://notes.example.com",
      }),
      "zilobase-app:instance-1",
    );
  });

  test("an active profile snapshot restores the last workspace", async () => {
    const { applyActiveDesktopProfileWorkspace } = await loadModule(
      "/src/platform/server/desktop-server.ts",
    );
    let workspaceId = null;
    applyActiveDesktopProfileWorkspace(
      {
        activeInstanceId: "instance-1",
        profiles: [
          {
            active: true,
            hasCredentials: true,
            lastActiveWorkspaceId: "workspace-9",
            lastPath: "/recents",
            lastUsedAt: null,
            server: {
              apiOrigin: "https://notes.example.com",
              displayName: "Team Notes",
              instanceId: "instance-1",
              issuer: "https://notes.example.com",
              minimumDesktopVersion: "0.0.30",
              protocolVersion: 1,
              serverVersion: "0.0.30",
              webOrigin: "https://notes.example.com",
            },
            workspaces: [],
          },
        ],
      },
      (value) => {
        workspaceId = value;
      },
    );
    assert.equal(workspaceId, "workspace-9");
  });
  test("switch requests notify progress before the installed session operation and propagate failures", async () => {
    const { installDesktopServerSwitch, executeDesktopServerSwitch, subscribeDesktopServerSwitch } =
      await loadModule("/src/features/desktop/server/desktop-server-switch.ts");
    const events = [];
    const request = { server: { instanceId: "target" }, path: "/recents" };
    const unsubscribe = subscribeDesktopServerSwitch((progress) =>
      events.push(["progress", progress.server]),
    );
    installDesktopServerSwitch(async (value) => {
      events.push(["switch", value]);
      return value.path;
    });
    try {
      assert.equal(await executeDesktopServerSwitch(request), "/recents");
      assert.deepEqual(events, [
        ["progress", request.server],
        ["switch", request],
      ]);
      const failure = new Error("candidate rejected");
      installDesktopServerSwitch(async () => {
        throw failure;
      });
      await assert.rejects(executeDesktopServerSwitch(request), (error) => error === failure);
    } finally {
      unsubscribe();
    }
  });
}
