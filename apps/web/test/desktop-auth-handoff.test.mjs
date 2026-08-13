import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("desktop Google auth is owned by the native coordinator", async () => {
    const source = await readFile(
      new URL("../src/lib/google-auth.ts", import.meta.url),
      "utf8",
    )

    assert.match(source, /invoke\("start_google_oauth"\)/)
    assert.match(source, /invoke\("cancel_google_oauth"\)/)
    assert.doesNotMatch(source, /zilobase:\/\/auth/)
  })

  test("desktop Google auth has explicit waiting and finalizing states", async () => {
    const source = await readFile(
      new URL("../src/components/login-form.tsx", import.meta.url),
      "utf8",
    )

    assert.match(source, /phase: "waiting_for_browser"/)
    assert.match(source, /phase: "finalizing"/)
    assert.match(source, /await reloadDesktopAuthCredentials\(\)/)
    assert.match(source, /sessionQueryOptions\(webAuthClient\)/)
    assert.match(source, /Waiting for browser sign-in\.\.\./)
    assert.doesNotMatch(source, /addEventListener\("focus"/)
  })
}
