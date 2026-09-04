export function register({ loadModule, readSource, assert, test }) {
  test("self-host setup keeps its one-time token out of URLs and browser storage", async () => {
    const [page, router] = await Promise.all([
      readSource("/src/features/auth/pages/setup.tsx"),
      readSource("/src/app/routing/route-groups/public-routes.tsx"),
    ])

    assert.match(router, /path: "\/setup"/)
    assert.match(page, /"x-zilobase-bootstrap-token"/)
    assert.match(page, /\/api\/instance\/bootstrap/)
    assert.doesNotMatch(page, /localStorage|sessionStorage|URLSearchParams/)
  })

  test("bootstrap-required login errors redirect to self-host setup", async () => {
    const [redirects, router, validators] = await Promise.all([
      loadModule("/src/features/auth/lib/bootstrap-redirect.ts"),
      readSource("/src/app/routing/route-groups/public-routes.tsx"),
      readSource("/src/app/routing/search-validators.ts"),
    ])

    assert.equal(redirects.isBootstrapRequiredAuthError("bootstrap_required"), true)
    assert.equal(
      redirects.isBootstrapRequiredAuthError(
        "This_Zilobase_instance_must_be_bootstrapped_before_registration.",
      ),
      true,
    )
    assert.equal(redirects.isBootstrapRequiredAuthError("invalid_invitation"), false)
    assert.match(validators, /search\.error/)
    assert.match(router, /isBootstrapRequiredAuthError\(search\.error\)/)
    assert.match(router, /redirect\(\{ to: "\/setup" \}\)/)
  })
}
