export function register({ readSource, assert, test }) {
  test("interface typography is tokenized and limited to shared component boundaries", async () => {
    const [appStyles, designTokens] = await Promise.all([
      readSource("/src/App.css"),
      readSource("/src/styles/design-tokens.css"),
    ])

    for (const token of ["dropdown", "sidebar", "tabs", "database"]) {
      assert.match(
        designTokens,
        new RegExp(`--font-weight-${token}: var\\(--font-weight-interface\\);`),
      )
      assert.match(
        appStyles,
        new RegExp(`font-weight: var\\(--font-weight-${token}\\) !important;`),
      )
    }

    assert.match(appStyles, /\[data-slot="dropdown-menu-content"\]/)
    assert.match(appStyles, /\[data-slot="drop-drawer-content"\]/)
    assert.match(appStyles, /\[data-slot="select-content"\]/)
    assert.match(appStyles, /\[data-slot="sidebar"\]/)
    assert.match(appStyles, /\[data-slot="tabs"\]/)
    assert.match(appStyles, /\.database-block-shell/)
    assert.doesNotMatch(appStyles, /:where\(body, body \*\)/)
    assert.doesNotMatch(appStyles, /font-weight: 450/)
  })
}
