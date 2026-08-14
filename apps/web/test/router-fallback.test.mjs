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
    assert.match(source, /path: "\/recents"/)
    assert.doesNotMatch(source, /\/dashboard/)
  })
}
