import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("desktop auth returns through an explicit user gesture", async () => {
    const source = await readFile(
      new URL("../src/pages/desktop-auth.tsx", import.meta.url),
      "utf8",
    )
    const completionFunction = source.slice(
      source.indexOf("async function completeDesktopSignIn"),
    )

    assert.match(
      source,
      /<Button onClick=\{\(\) => window\.location\.assign\(deepLink\)\}>/,
    )
    assert.match(source, /Click below to securely return/)
    assert.doesNotMatch(completionFunction, /window\.location\.assign/)
  })

  test("desktop Google pending state recovers on focus and timeout", async () => {
    const source = await readFile(
      new URL("../src/components/login-form.tsx", import.meta.url),
      "utf8",
    )

    assert.match(source, /window\.addEventListener\("focus", resetGooglePending\)/)
    assert.match(source, /window\.setTimeout\(\(\) => \{/)
    assert.match(source, /desktop_auth\.browser_return/)
    assert.match(source, /Waiting for browser sign-in\.\.\./)
  })
}
