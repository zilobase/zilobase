export function register({ assert, loadModule, test }) {
  test("desktop builds use the hosted API", async () => {
    const { resolveApiBaseUrl } = await loadModule("/src/features/desktop/network/api.ts")

    assert.equal(
      resolveApiBaseUrl(new URL("tauri://localhost/login")),
      "https://api.zilobase.com",
    )
    assert.equal(
      resolveApiBaseUrl(new URL("http://tauri.localhost/login")),
      "https://api.zilobase.com",
    )
  })

  test("desktop requests resolve against the selected runtime server", async () => {
    const { resolveApiBaseUrl } = await loadModule("/src/features/desktop/network/api.ts")
    const server = {
      apiOrigin: "http://127.0.0.1:8787",
      displayName: "Local Zilobase",
      instanceId: "local-instance",
      issuer: "http://127.0.0.1:8787",
      minimumDesktopVersion: "0.0.30",
      protocolVersion: 1,
      serverVersion: "0.0.30",
      webOrigin: "http://127.0.0.1:8787",
    }

    assert.equal(
      resolveApiBaseUrl(new URL("tauri://localhost/login"), server),
      "http://127.0.0.1:8787",
    )
    assert.equal(
      resolveApiBaseUrl(new URL("http://localhost:1420/login"), server),
      "http://127.0.0.1:8787",
      "Tauri dev must not fall back to the compile-time Vite API",
    )
  })

  test("request cancellation is not treated as a connectivity failure", async () => {
    const { isRequestAbort } = await loadModule("/src/features/desktop/network/api.ts")

    assert.equal(isRequestAbort(new DOMException("Canceled", "AbortError")), true)
    assert.equal(isRequestAbort({ name: "AbortError" }), true)
    assert.equal(isRequestAbort(new TypeError("Failed to fetch")), false)
  })

  test("API requests can fail with a bounded network timeout", async () => {
    const { apiFetch, NetworkUnavailableError } = await loadModule(
      "/src/features/desktop/network/api.ts",
    )
    const originalFetch = globalThis.fetch

    globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        )
      })

    try {
      await assert.rejects(
        () => apiFetch("/session", { timeoutMs: 5 }),
        (error) =>
          error instanceof NetworkUnavailableError &&
          error.message === "Zilobase did not respond in time.",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
}
