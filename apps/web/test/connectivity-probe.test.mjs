export function register({ assert, loadModule, test }) {
  test("background probes preserve a confirmed online connection", async () => {
    const { connectivityStateDuringProbe } = await loadModule(
      "/src/lib/connectivity-probe.ts",
    )

    assert.equal(connectivityStateDuringProbe("online"), "online")
    assert.equal(connectivityStateDuringProbe("checking"), "checking")
    assert.equal(connectivityStateDuringProbe("offline"), "checking")
    assert.equal(
      connectivityStateDuringProbe("service-unavailable"),
      "checking",
    )
  })

  test("startup waits for the first connectivity probe, then uses cache or fails closed", async () => {
    const { resolveOfflineFallback, waitForSettledConnectivity } =
      await loadModule("/src/lib/connectivity-probe.ts")

    assert.equal(
      await waitForSettledConnectivity({
        getState: () => "online",
        subscribe: () => () => undefined,
        timeoutMs: 5,
      }),
      "online",
    )

    let state = "checking"
    const listeners = new Set()
    const pending = waitForSettledConnectivity({
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      timeoutMs: 1_000,
    })
    state = "service-unavailable"
    for (const listener of listeners) listener()
    assert.equal(await pending, "service-unavailable")

    assert.equal(
      await waitForSettledConnectivity({
        getState: () => "checking",
        subscribe: () => () => undefined,
        timeoutMs: 5,
      }),
      "checking",
    )

    assert.deepEqual(resolveOfflineFallback("online", { id: 1 }), {
      type: "network",
    })
    assert.deepEqual(
      resolveOfflineFallback("service-unavailable", { id: 1 }),
      { type: "fallback", value: { id: 1 } },
    )
    assert.deepEqual(resolveOfflineFallback("offline", null), {
      type: "unavailable",
    })
    assert.deepEqual(resolveOfflineFallback("checking", { id: 1 }), {
      type: "fallback",
      value: { id: 1 },
    })
  })
}
