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
}
