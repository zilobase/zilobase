export function register({ assert, readSource, readWorkspace, test }) {
  test("desktop browser auth is owned by the native PKCE coordinator", async () => {
    const source = await readSource("/src/features/auth/lib/google-auth.ts")

    assert.match(source, /invoke\("start_browser_authorization"\)/)
    assert.match(source, /invoke\("cancel_browser_authorization"\)/)
    assert.doesNotMatch(source, /zilobase:\/\/auth/)
    assert.doesNotMatch(source, /GOOGLE_DESKTOP_CLIENT/)
  })

  test("desktop signed-out shell is browser-only", async () => {
    const [screen, login, signup, loginForm] = await Promise.all([
      readSource("/src/features/auth/components/desktop-browser-auth-screen.tsx"),
      readSource("/src/features/auth/pages/login.tsx"),
      readSource("/src/features/auth/pages/signup.tsx"),
      readSource("/src/features/auth/components/login-form.tsx"),
    ])

    assert.match(screen, /phase: "waiting_for_browser"/)
    assert.match(screen, /phase: "finalizing"/)
    assert.match(screen, /await reloadDesktopAuthCredentials\(\)/)
    assert.match(screen, /useZilobaseFeatures\(\)/)
    assert.match(screen, /sessionQueryOptions\(auth\)/)
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

  test("desktop and browser sign-out stay on their own session", async () => {
    const [provider, token, routes] = await Promise.all([
      readSource("/src/app/providers/features-provider.tsx"),
      readSource("/src/lib/desktop-auth-token.ts"),
      readWorkspace("/apps/server/src/features/desktop-auth/routes.ts"),
    ])

    assert.match(provider, /authFetch\("\/sign-out"/)
    assert.match(provider, /clearApiAuthToken/)
    assert.doesNotMatch(provider, /revokeSessions|signOutAll/)
    assert.match(token, /invoke\("set_auth_token"/)
    assert.match(routes, /internalAdapter.createSession/)
    assert.doesNotMatch(routes, /deleteSession|revokeSessions/)
  })

  test("desktop server metadata initializes before credentials and providers", async () => {
    const source = await readSource("/src/app/main.tsx")
    const server = source.indexOf("await initializeDesktopServer()")
    const credentials = source.indexOf("await initializeDesktopAuthToken()")
    const providers = source.indexOf("<AppProviders>")

    assert.ok(server >= 0)
    assert.ok(credentials > server)
    assert.ok(providers > credentials)
  })
}
