export function register({ readSource, assert, test }) {
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
}
