export function register({ readSource, assert, loadModule, test }) {
  test("runtime server metadata resolves API, image, and realtime origins", async () => {
    const {
      resolveDesktopServerUrls,
      resolveRuntimeWebSocketUrl,
      validateDesktopServer,
    } =
      await loadModule("/src/features/desktop/server/desktop-server.ts")
    const server = validateDesktopServer({
      apiOrigin: "https://notes.example.com",
      displayName: "Team Notes",
      instanceId: "instance-1",
      issuer: "https://notes.example.com",
      minimumDesktopVersion: "0.0.30",
      protocolVersion: 1,
      serverVersion: "0.0.30",
      webOrigin: "https://notes.example.com",
    })

    assert.deepEqual(resolveDesktopServerUrls(server), {
      apiOrigin: "https://notes.example.com",
      collaborationUrl: "wss://notes.example.com/collaboration",
      imageOrigin: "https://notes.example.com",
      realtimeUrl: "wss://notes.example.com/database-collaboration",
      webOrigin: "https://notes.example.com",
    })
    assert.equal(
      resolveRuntimeWebSocketUrl(
        "wss://old.example.com/collaboration?document=page.1",
        "collaboration",
        server,
      ),
      "wss://notes.example.com/collaboration?document=page.1",
    )
    assert.throws(() =>
      validateDesktopServer({
        ...server,
        instanceId: "instance id with spaces",
      }),
    )
    assert.throws(() =>
      validateDesktopServer({
        ...server,
        apiOrigin: "https://notes.example.com/path",
        issuer: "https://notes.example.com/path",
      }),
    )
  })

  test("the built-in Cloud alias matches Cloud discovery without weakening custom instance binding", async () => {
    const {
      CLOUD_DESKTOP_SERVER,
      desktopCloudConnectUrl,
      desktopDevelopmentApiOrigin,
      desktopServersReferToSameInstance,
      isCloudDesktopServer,
    } = await loadModule("/src/features/desktop/server/desktop-server.ts")
    assert.equal(isCloudDesktopServer(CLOUD_DESKTOP_SERVER, false), true)
    assert.equal(isCloudDesktopServer(CLOUD_DESKTOP_SERVER, true), false)
    assert.equal(
      isCloudDesktopServer({
        ...CLOUD_DESKTOP_SERVER,
        apiOrigin: "https://notes.example.com",
        issuer: "https://notes.example.com",
        webOrigin: "https://notes.example.com",
      }),
      false,
    )
    assert.equal(desktopCloudConnectUrl(false), CLOUD_DESKTOP_SERVER.apiOrigin)
    assert.equal(desktopCloudConnectUrl(true), desktopDevelopmentApiOrigin())
    assert.equal(
      isCloudDesktopServer(
        {
          ...CLOUD_DESKTOP_SERVER,
          apiOrigin: "http://localhost:3000",
          instanceId: "zilobase-dev",
          issuer: "http://localhost:3000",
          webOrigin: "http://localhost:3000",
        },
        true,
      ),
      true,
    )
    const discoveredCloud = {
      ...CLOUD_DESKTOP_SERVER,
      instanceId: "cloud-database-instance",
    }
    assert.equal(
      desktopServersReferToSameInstance(CLOUD_DESKTOP_SERVER, discoveredCloud),
      true,
    )
    assert.equal(
      desktopServersReferToSameInstance(
        {
          ...CLOUD_DESKTOP_SERVER,
          apiOrigin: "https://notes.example.com",
          instanceId: "instance-1",
          issuer: "https://notes.example.com",
          webOrigin: "https://notes.example.com",
        },
        {
          ...CLOUD_DESKTOP_SERVER,
          apiOrigin: "https://notes.example.com",
          instanceId: "instance-2",
          issuer: "https://notes.example.com",
          webOrigin: "https://notes.example.com",
        },
      ),
      false,
    )
  })

  test("settings lists saved desktop servers and can remove one instance", async () => {
    const source = await readSource("/src/features/settings/pages/preferences.tsx")
    assert.match(source, /listDesktopServerProfiles/)
    assert.match(source, /Remove from this device/)
    assert.match(source, /Connect another server/)
    assert.match(source, /executeDesktopServerSwitch/)
    assert.doesNotMatch(source, /DesktopServerSelector/)
    assert.doesNotMatch(source, /Sign out to change server\?/)
  })

  test("connect another server omits Cloud when it is already saved", async () => {
    const source = await readSource("/src/features/desktop/components/desktop-connect-server-dialog.tsx")

    assert.match(source, /cloudAlreadySaved \? null/)
    assert.doesNotMatch(source, /Switch to Zilobase Cloud/)
  })

  test("desktop auth picks a server before continuing in the browser", async () => {
    const [connect, screen, login, signup, router] = await Promise.all([
      readSource("/src/features/desktop/pages/connect.tsx"),
      readSource("/src/features/desktop/auth/desktop-browser-auth-screen.tsx"),
      readSource("/src/features/auth/pages/login.tsx"),
      readSource("/src/features/auth/pages/signup.tsx"),
      readSource("/src/app/routing/route-groups/public-routes.tsx"),
    ])

    assert.match(connect, /Choose a server/)
    assert.match(connect, /Use Zilobase Cloud/)
    assert.match(connect, /desktopCloudConnectUrl/)
    assert.match(connect, /Verify and continue/)
    assert.match(connect, /continue in your browser/)
    assert.match(screen, /Change server/)
    assert.match(screen, /to="\/connect"/)
    assert.match(screen, /Back to/)
    assert.match(screen, /server\.apiOrigin/)
    assert.match(login, /DesktopBrowserAuthScreen/)
    assert.match(signup, /DesktopBrowserAuthScreen/)
    assert.match(router, /throw redirect\(\{ to: "\/login" \}\)/)
    assert.doesNotMatch(router, /isTauri\(\) \? "\/connect"/)
  })
}
