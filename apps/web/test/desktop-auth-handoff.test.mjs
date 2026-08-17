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

  test("desktop signed-out shell is browser-only", async () => {
    const [screen, login, signup, loginForm] = await Promise.all([
      readFile(
        new URL("../src/components/desktop-browser-auth-screen.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/pages/login.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/pages/signup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/login-form.tsx", import.meta.url), "utf8"),
    ])

    assert.match(screen, /phase: "waiting_for_browser"/)
    assert.match(screen, /phase: "finalizing"/)
    assert.match(screen, /await reloadDesktopAuthCredentials\(\)/)
    assert.match(screen, /sessionQueryOptions\(webAuthClient\)/)
    assert.match(screen, /Waiting for browser sign-in\.\.\./)
    assert.match(screen, /Continue in Browser/)
    assert.match(screen, /Change server/)
    assert.match(screen, /signInWithDesktopBrowser/)
    assert.doesNotMatch(screen, /addEventListener\("focus"/)
    assert.doesNotMatch(screen, /useSignInWithPassword/)
    assert.doesNotMatch(screen, /useRequestSignInOtp/)
    assert.doesNotMatch(screen, /Continue with Google/)

    assert.match(login, /DesktopBrowserAuthScreen/)
    assert.match(signup, /DesktopBrowserAuthScreen/)
    assert.match(login, /isTauri\(\)/)
    assert.match(signup, /isTauri\(\)/)

    assert.doesNotMatch(loginForm, /isTauri/)
    assert.doesNotMatch(loginForm, /signInWithDesktopBrowser/)
    assert.match(loginForm, /signInWithGoogle/)
    assert.match(loginForm, /Continue with Google/)
    assert.match(loginForm, /useRequestSignInOtp/)
    assert.match(loginForm, /Sign in/)
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
