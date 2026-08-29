export function register({ assert, loadModule, test }) {
  const server = {
    apiOrigin: "https://notes.example.com",
    displayName: "Team Notes",
    instanceId: "instance-1",
    issuer: "https://notes.example.com",
    minimumDesktopVersion: "0.0.30",
    protocolVersion: 1,
    serverVersion: "0.0.30",
    webOrigin: "https://notes.example.com",
  };

  test("desktop links are instance-scoped and contain no credentials", async () => {
    const {
      buildDesktopConnectLink,
      buildDesktopDeepLink,
      parseDesktopDeepLink,
      resolveDesktopDeepLinkAction,
    } = await loadModule("/src/lib/desktop-deep-link.ts");
    const path = "/p/page-1?view=board#comments";
    const openLink = buildDesktopDeepLink(path, server);
    const connectLink = buildDesktopConnectLink(server.apiOrigin);

    assert.deepEqual(parseDesktopDeepLink(openLink), {
      instanceId: "instance-1",
      path,
      serverUrl: "https://notes.example.com",
      type: "open",
    });
    assert.deepEqual(resolveDesktopDeepLinkAction(openLink, server), {
      path,
      type: "open-path",
    });
    assert.deepEqual(parseDesktopDeepLink(connectLink), {
      serverUrl: "https://notes.example.com",
      type: "connect",
    });
    assert.doesNotMatch(`${openLink}${connectLink}`, /token|code=|password/i);
  });

  test("an open link for another instance requires verified replacement", async () => {
    const { buildDesktopDeepLink, resolveDesktopDeepLinkAction } =
      await loadModule("/src/lib/desktop-deep-link.ts");
    const other = { ...server, instanceId: "instance-2" };

    assert.deepEqual(
      resolveDesktopDeepLinkAction(
        buildDesktopDeepLink("/recents", other),
        server,
      ),
      {
        expectedInstanceId: "instance-2",
        path: "/recents",
        serverUrl: "https://notes.example.com",
        type: "change-server",
      },
    );
  });

  test("malformed, duplicated, insecure, and malicious links are rejected", async () => {
    const { parseDesktopDeepLink } = await loadModule(
      "/src/lib/desktop-deep-link.ts",
    );
    for (const value of [
      "zilobase://open?path=https://evil.test",
      "zilobase://connect?server=http%3A%2F%2Fevil.test",
      "zilobase://connect?server=https%3A%2F%2Fnotes.example.com%2Fpath",
      "zilobase://connect?server=https%3A%2F%2Fnotes.example.com&server=https%3A%2F%2Fevil.test",
      "zilobase://connect?server=https%3A%2F%2Fnotes.example.com&token=secret",
      "zilobase://open?instance=instance-1&server=https%3A%2F%2Fnotes.example.com&path=%2F%2Fevil.test",
      "other://open?instance=instance-1&server=https%3A%2F%2Fnotes.example.com&path=%2Frecents",
      "zilobase://auth?token=secret",
    ]) {
      assert.equal(parseDesktopDeepLink(value), null, value);
    }
  });
}
