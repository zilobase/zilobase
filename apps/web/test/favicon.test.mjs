export function register({ assert, loadModule, test }) {
  test("only item routes use their active item icon", async () => {
    const { getRouteFaviconIcon } = await loadModule("/src/lib/favicon.ts")

    assert.equal(
      getRouteFaviconIcon({ pathname: "/p/page-1", itemIcon: "🚀" }),
      "🚀",
    )
    assert.equal(
      getRouteFaviconIcon({ pathname: "/d/database-1", itemIcon: "🗃️" }),
      "🗃️",
    )
    assert.equal(
      getRouteFaviconIcon({ pathname: "/recents", itemIcon: "👥" }),
      null,
    )
    assert.equal(getRouteFaviconIcon({ pathname: "/settings" }), null)
  })

  test("item route titles include the Zilobase brand", async () => {
    const { getRouteDocumentTitle } = await loadModule("/src/lib/favicon.ts")

    assert.equal(
      getRouteDocumentTitle({
        pathname: "/p/page-1",
        itemTitle: "This is a test page",
      }),
      "This is a test page | Zilobase",
    )
    assert.equal(
      getRouteDocumentTitle({ pathname: "/recents", itemTitle: "Recents" }),
      "Zilobase",
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
