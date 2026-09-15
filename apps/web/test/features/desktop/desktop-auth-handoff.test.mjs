export function register({ assert, readSource, readWorkspace, test }) {
  test("desktop browser auth is owned by the native PKCE coordinator", async () => {
    const source = await readSource(
      "/src/features/desktop/auth/browser-authorization.ts",
    )

    assert.match(source, /invoke\("start_browser_authorization"\)/)
    assert.match(source, /invoke\("cancel_browser_authorization"\)/)
    assert.doesNotMatch(source, /zilobase:\/\/auth/)
    assert.doesNotMatch(source, /GOOGLE_DESKTOP_CLIENT/)
  })

  test("desktop signed-out shell is browser-only", async () => {
    const [screen, login, signup, loginForm] = await Promise.all([
      readSource("/src/features/desktop/auth/desktop-browser-auth-screen.tsx"),
      readSource("/src/features/auth/screens/login.tsx"),
      readSource("/src/features/auth/screens/signup.tsx"),
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
    assert.match(login, /isDesktopApp\(\)/)
    assert.match(signup, /isDesktopApp\(\)/)

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
      readSource("/src/platform/auth/desktop-auth-token.ts"),
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

  test("packaged self-host handoff accepts signed-out and connection-error startup", async () => {
    const [source, routeErrorPage, publicRoutes] = await Promise.all([
      readWorkspace("/apps/desktop/e2e/selfhost.mjs"),
      readSource("/src/app/routing/route-error-page.tsx"),
      readSource("/src/app/routing/route-groups/public-routes.tsx"),
    ])

    assert.doesNotMatch(
      source,
      /h1\[normalize-space\(\)='Continue in your browser'\]/,
    )
    assert.match(
      source,
      /self::a or self::button.*normalize-space\(\)='Change server'/,
    )
    assert.match(
      source,
      /browser\.execute\(\(target\) => target\.click\(\), element\)/,
    )
    assert.match(source, /browser\.waitUntil/)
    assert.match(source, /element = await browser\.\$\(selector\)/)
    assert.match(routeErrorPage, /navigate\(\{ to: "\/connect" \}\)/)
    assert.doesNotMatch(routeErrorPage, /window\.location\.assign\("\/connect"\)/)
    const connectRoute = publicRoutes.slice(
      publicRoutes.indexOf("const connectRoute"),
      publicRoutes.indexOf("const signupRoute"),
    )
    const connectivityCheck = connectRoute.indexOf("getConnectivityState()")
    const sessionCheck = connectRoute.indexOf("getFreshSession")
    assert.ok(connectivityCheck >= 0)
    assert.ok(sessionCheck >= 0)
    assert.ok(connectivityCheck < sessionCheck)
  })
}
