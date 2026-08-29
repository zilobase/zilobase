export function register({ readSource, assert, test }) {
  test("self-host setup keeps its one-time token out of URLs and browser storage", async () => {
    const [page, router] = await Promise.all([
      readSource("/src/pages/setup.tsx"),
      readSource("/src/router.tsx"),
    ])

    assert.match(router, /path: "\/setup"/)
    assert.match(page, /"x-zilobase-bootstrap-token"/)
    assert.match(page, /\/api\/instance\/bootstrap/)
    assert.doesNotMatch(page, /localStorage|sessionStorage|URLSearchParams/)
  })
}
