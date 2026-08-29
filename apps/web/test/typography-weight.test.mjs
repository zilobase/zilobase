import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("all application text uses the shared 500 weight token", async () => {
    const [appStyles, designTokens] = await Promise.all([
      readFile(new URL("../src/App.css", import.meta.url), "utf8"),
      readFile(new URL("../src/styles/design-tokens.css", import.meta.url), "utf8"),
    ])

    assert.match(designTokens, /--font-weight-interface: 500;/)
    assert.match(designTokens, /--font-weight-normal: var\(--font-weight-interface\);/)
    assert.match(designTokens, /--font-weight-semibold: var\(--font-weight-interface\);/)
    assert.match(designTokens, /--font-weight-bold: var\(--font-weight-interface\);/)
    assert.match(
      appStyles,
      /:where\(body, body \*\)\s*\{\s*font-weight: var\(--font-weight-interface\) !important;/,
    )
    assert.doesNotMatch(appStyles, /font-weight: 450/)
  })
}
