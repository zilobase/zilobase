import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("route authentication never leaves a blank screen", async () => {
    const source = await readFile(
      new URL("../src/router.tsx", import.meta.url),
      "utf8",
    )

    assert.match(source, /defaultPendingComponent: RoutePendingPage/)
    assert.match(source, /defaultErrorComponent: RouteErrorPage/)
    assert.match(source, /Connecting to Zilobase\.\.\./)
    assert.match(source, /Your desktop session is still saved/)
    assert.match(source, /window\.location\.reload\(\)/)
    assert.match(source, /path: "\/connect"/)
    assert.match(source, /Change server/)
    assert.match(source, /window\.location\.assign\("\/connect"\)/)
    assert.match(source, /getConnectivityState\(\) !== "online"/)
    assert.match(source, /waitForSettledConnectivity/)
    assert.match(source, /resolveOfflineFallback/)
    assert.match(source, /decision\.type === "unavailable"/)
    assert.match(source, /getFreshSession\(\{ optional: true \}\)/)
    assert.match(source, /path: "\/recents"/)
    assert.doesNotMatch(source, /\/dashboard/)
  })
}
