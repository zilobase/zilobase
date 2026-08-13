export function register({ assert, loadModule, test }) {
  test("desktop builds use the hosted API", async () => {
    const { resolveApiBaseUrl } = await loadModule("/src/lib/api.ts")

    assert.equal(
      resolveApiBaseUrl(new URL("tauri://localhost/login")),
      "https://api.zilobase.com",
    )
    assert.equal(
      resolveApiBaseUrl(new URL("http://tauri.localhost/login")),
      "https://api.zilobase.com",
    )
  })

  test("request cancellation is not treated as a connectivity failure", async () => {
    const { isRequestAbort } = await loadModule("/src/lib/api.ts")

    assert.equal(isRequestAbort(new DOMException("Canceled", "AbortError")), true)
    assert.equal(isRequestAbort({ name: "AbortError" }), true)
    assert.equal(isRequestAbort(new TypeError("Failed to fetch")), false)
  })

  test("API requests can fail with a bounded network timeout", async () => {
    const { apiFetch, NetworkUnavailableError } = await loadModule(
      "/src/lib/api.ts",
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
