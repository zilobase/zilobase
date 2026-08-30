export function register({ assert, loadModule, test }) {
  test("mail HTML removes scripts, active links, and external image requests", async () => {
    const { parseHTML } = await import("linkedom")
    const previous = {
      DOMParser: globalThis.DOMParser,
      Element: globalThis.Element,
      Node: globalThis.Node,
      window: globalThis.window,
    }
    const parsed = parseHTML("<!doctype html><html><body></body></html>")
    Object.defineProperty(parsed.window, "location", { value: new URL("https://zilobase.example/mail") })
    globalThis.window = parsed.window
    globalThis.DOMParser = parsed.window.DOMParser
    globalThis.Element = parsed.window.Element
    globalThis.Node = parsed.window.Node
    try {
      const { sanitizeMailHtml } = await loadModule("/src/features/mail/model/mail-html.ts")
      const result = sanitizeMailHtml(
        '<script>alert(1)</script><img src="https://tracker.example/pixel" srcset="https://tracker.example/2x"><a href="javascript:alert(1)">bad</a><a href="https://example.com">safe</a>',
        (value) => value,
      )

      assert.doesNotMatch(result, /<script|javascript:|tracker\.example/)
      assert.match(result, /data-zilobase-external-image="blocked"/)
      assert.match(result, /href="https:\/\/example\.com\/"/)
      assert.match(result, /rel="noopener noreferrer"/)
    } finally {
      globalThis.window = previous.window
      globalThis.DOMParser = previous.DOMParser
      globalThis.Element = previous.Element
      globalThis.Node = previous.Node
    }
  })
}
