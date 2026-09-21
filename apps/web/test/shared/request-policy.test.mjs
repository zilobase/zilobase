export function register({ assert, loadModule, test }) {
  test("request policy intercepts before transport and observes HTTP failures without losing status", async () => {
    const { apiFetch, ApiError, installRequestPolicy } = await loadModule("/apps/web/test/support/network-runtime.ts")
    const original = globalThis.fetch
    const events = []
    const policy = {
      intercept: () => ({ handled: true, value: { local: true } }),
      observe: (event) => events.push(event),
      transformResponse: (_path, value) => ({ ...value, overlay: true }),
    }
    installRequestPolicy(policy)
    globalThis.fetch = async () => { throw new Error("transport should not run") }
    try {
      assert.deepEqual(await apiFetch("/pages", { method: "POST" }), { local: true })
      assert.deepEqual(events, [])
      policy.intercept = () => ({ handled: false })
      globalThis.fetch = async () => new Response('{"message":"Denied"}', { status: 401 })
      await assert.rejects(apiFetch("/pages"), (error) => error instanceof ApiError && error.status === 401)
      assert.deepEqual(events, [{ type: "response", status: 401 }])
      globalThis.fetch = async () => new Response('{"id":"page"}')
      assert.deepEqual(await apiFetch("/pages"), { id: "page", overlay: true })
    } finally {
      globalThis.fetch = original
      installRequestPolicy({ intercept: () => ({ handled: false }), observe: () => {}, transformResponse: (_path, value) => value })
    }
  })

  test("transport failure is observed but caller cancellation and timeout are not connectivity failures", async () => {
    const { apiFetch, NetworkUnavailableError, installRequestPolicy } = await loadModule("/apps/web/test/support/network-runtime.ts")
    const original = globalThis.fetch
    const events = []
    installRequestPolicy({ intercept: () => ({ handled: false }), observe: (event) => events.push(event), transformResponse: (_path, value) => value })
    try {
      const failure = new TypeError("network failed")
      globalThis.fetch = async () => { throw failure }
      await assert.rejects(apiFetch("/pages"), (error) => error === failure)
      assert.deepEqual(events, [{ type: "network-error", error: failure }])
      events.length = 0
      const canceled = new DOMException("canceled", "AbortError")
      globalThis.fetch = async () => { throw canceled }
      await assert.rejects(apiFetch("/pages"), (error) => error === canceled)
      globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(canceled), { once: true }))
      await assert.rejects(apiFetch("/pages", { timeoutMs: 5 }), NetworkUnavailableError)
      assert.deepEqual(events, [])
    } finally {
      globalThis.fetch = original
      installRequestPolicy({ intercept: () => ({ handled: false }), observe: () => {}, transformResponse: (_path, value) => value })
    }
  })
  test("application composition preserves demo precedence and reports transport failures", async () => {
    const runtime = await loadModule("/apps/web/test/support/network-runtime.ts")
    const originalFetch = globalThis.fetch
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
    const window = new EventTarget()
    Object.defineProperty(globalThis, "window", { configurable: true, value: window })
    const statuses = []
    window.addEventListener("zilobase:authentication-required", () => statuses.push("authentication"))
    try {
      runtime.configureApplicationRequests()
      globalThis.fetch = async () => { throw new TypeError("unreachable") }
      await assert.rejects(runtime.apiFetch("/pages", { method: "POST" }), runtime.NetworkUnavailableError)
      runtime.installDemoTransport({ interceptMutation: () => ({ handled: true, value: "demo" }), applyReadOverlay: (_path, value) => value })
      assert.equal(await runtime.apiFetch("/pages", { method: "POST" }), "demo")
      runtime.installDemoTransport({ interceptMutation: () => ({ handled: false }), applyReadOverlay: (_path, value) => value })
      globalThis.fetch = async () => new Response("denied", { status: 401 })
      await assert.rejects(runtime.apiFetch("/pages"), runtime.ApiError)
      assert.deepEqual(statuses, ["authentication"])
      globalThis.fetch = async () => new Response("unavailable", { status: 503 })
      await assert.rejects(runtime.apiFetch("/pages"), runtime.ApiError)
      globalThis.fetch = async () => { throw new TypeError("unreachable") }
      await assert.rejects(runtime.apiFetch("/pages"), runtime.NetworkUnavailableError)
    } finally {
      globalThis.fetch = originalFetch
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
      else delete globalThis.window
      runtime.installRequestPolicy({ intercept: () => ({ handled: false }), observe: () => {}, transformResponse: (_path, value) => value })
    }
  })

}
