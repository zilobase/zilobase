import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("desktop browser auth is owned by the native PKCE coordinator", async () => {
    const source = await readFile(
      new URL("../src/lib/google-auth.ts", import.meta.url),
      "utf8",
    )

    assert.match(source, /invoke\("start_browser_authorization"\)/)
    assert.match(source, /invoke\("cancel_browser_authorization"\)/)
    assert.doesNotMatch(source, /zilobase:\/\/auth/)
    assert.doesNotMatch(source, /GOOGLE_DESKTOP_CLIENT/)
  })

  test("desktop browser auth has explicit waiting and finalizing states", async () => {
    const source = await readFile(
      new URL("../src/components/login-form.tsx", import.meta.url),
      "utf8",
    )

    assert.match(source, /phase: "waiting_for_browser"/)
    assert.match(source, /phase: "finalizing"/)
    assert.match(source, /await reloadDesktopAuthCredentials\(\)/)
    assert.match(source, /sessionQueryOptions\(webAuthClient\)/)
    assert.match(source, /Waiting for browser sign-in\.\.\./)
    assert.match(source, /Continue with Google/)
    assert.match(source, /useRequestSignInOtp/)
    assert.match(source, /signInWithGoogle/)
    assert.match(source, /Google opens in your browser/)
    assert.match(source, /Sign in/)
    assert.doesNotMatch(source, /addEventListener\("focus"/)
  })

  test("desktop server metadata initializes before credentials and providers", async () => {
    const source = await readFile(
      new URL("../src/main.tsx", import.meta.url),
      "utf8",
    )
    const server = source.indexOf("await initializeDesktopServer()")
    const credentials = source.indexOf("await initializeDesktopAuthToken()")
    const providers = source.indexOf("<AppProviders>")

    assert.ok(server >= 0)
    assert.ok(credentials > server)
    assert.ok(providers > credentials)
  })
}
