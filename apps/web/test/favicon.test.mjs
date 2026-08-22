export function register({ assert, loadModule, test }) {
  test("route favicons follow library views and item icons", async () => {
    const { getRouteFaviconIcon } = await loadModule("/src/lib/favicon.ts")

    assert.equal(
      getRouteFaviconIcon({ pathname: "/recents", libraryView: "shared" }),
      "👥",
    )
    assert.equal(
      getRouteFaviconIcon({ pathname: "/recents", libraryView: "teamspaces" }),
      "🏢",
    )
    assert.equal(getRouteFaviconIcon({ pathname: "/trash" }), "🗑️")
    assert.equal(
      getRouteFaviconIcon({ pathname: "/p/page-1", itemIcon: "🚀" }),
      "🚀",
    )
  })

  test("emoji favicons are encoded SVG data URLs", async () => {
    const { createFaviconHref } = await loadModule("/src/lib/favicon.ts")
    const href = createFaviconHref("🚀")

    assert.match(href, /^data:image\/svg\+xml,/)
    assert.match(decodeURIComponent(href), /<text[^>]*>🚀<\/text>/)
  })

  test("stored SVG favicons receive an explicit theme color", async () => {
    const { createFaviconHref } = await loadModule("/src/lib/favicon.ts")
    const href = createFaviconHref(
      '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M0 0h24v24H0z"/></svg>',
      { color: "#abcdef" },
    )
    const svg = decodeURIComponent(href)

    assert.match(svg, /width="32"/)
    assert.match(svg, /height="32"/)
    assert.match(svg, /color="#abcdef"/)
    assert.doesNotMatch(svg, /width="1em"/)
  })
}
