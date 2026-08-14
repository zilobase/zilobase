import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("self-host setup keeps its one-time token out of URLs and browser storage", async () => {
    const [page, router] = await Promise.all([
      readFile(new URL("../src/pages/setup.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/router.tsx", import.meta.url), "utf8"),
    ])

    assert.match(router, /path: "\/setup"/)
    assert.match(page, /"x-zilobase-bootstrap-token"/)
    assert.match(page, /\/api\/instance\/bootstrap/)
    assert.doesNotMatch(page, /localStorage|sessionStorage|URLSearchParams/)
  })
}
