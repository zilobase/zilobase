import { readFile } from "node:fs/promises"

export function register({ assert, loadModule, test }) {
  test("runtime server metadata resolves API, image, and realtime origins", async () => {
    const {
      resolveDesktopServerUrls,
      resolveRuntimeWebSocketUrl,
      validateDesktopServer,
    } =
      await loadModule("/src/lib/desktop-server.ts")
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

  test("server selection exposes edit, verification, failure, and completion states", async () => {
    const {
      initialDesktopServerSelectionState,
      reduceDesktopServerSelection,
    } = await loadModule("/src/lib/desktop-server-selection.ts")

    const editing = reduceDesktopServerSelection(
      initialDesktopServerSelectionState,
      { type: "edit" },
    )
    const verifying = reduceDesktopServerSelection(editing, { type: "verify" })
    const failed = reduceDesktopServerSelection(verifying, {
      type: "failed",
      message: "TLS certificate could not be verified.",
    })

    assert.deepEqual(editing, { phase: "editing" })
    assert.deepEqual(verifying, { phase: "verifying" })
    assert.deepEqual(failed, {
      phase: "error",
      message: "TLS certificate could not be verified.",
    })
    assert.deepEqual(
      reduceDesktopServerSelection(failed, { type: "verified" }),
      { phase: "selected" },
    )
  })

  test("the built-in Cloud alias matches Cloud discovery without weakening custom instance binding", async () => {
    const {
      CLOUD_DESKTOP_SERVER,
      desktopServersReferToSameInstance,
      isCloudDesktopServer,
    } = await loadModule("/src/lib/desktop-server.ts")
    assert.equal(isCloudDesktopServer(CLOUD_DESKTOP_SERVER), true)
    assert.equal(
      isCloudDesktopServer({
        ...CLOUD_DESKTOP_SERVER,
        apiOrigin: "https://notes.example.com",
        issuer: "https://notes.example.com",
        webOrigin: "https://notes.example.com",
      }),
      false,
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

  test("change server offers Zilobase Cloud without typing the API origin", async () => {
    const source = await readFile(
      new URL("../src/components/desktop-server-selector.tsx", import.meta.url),
      "utf8",
    )
    assert.match(source, /Use Zilobase Cloud/)
    assert.match(source, /CLOUD_DESKTOP_SERVER\.apiOrigin/)
    assert.match(source, /isCloudDesktopServer/)
    assert.match(source, /onChangeRequest/)
    assert.match(source, /startEditing/)
  })

  test("settings change server signs out and continues on the login screen", async () => {
    const source = await readFile(
      new URL("../src/pages/settings/preferences.tsx", import.meta.url),
      "utf8",
    )
    assert.match(source, /onChangeRequest/)
    assert.match(source, /Sign out to change server\?/)
    assert.match(source, /Sign out and continue/)
    assert.match(source, /changeServer: true/)
  })
}
