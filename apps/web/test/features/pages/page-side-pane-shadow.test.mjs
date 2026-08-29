export function register({ readSource, assert, test }) {
  test("light side panes cast one continuous shadow through the top bar", async () => {
    const source = await readSource("/src/shared/styles/global.css")

    assert.match(
      source,
      /\.light[\s\S]*\[data-page-side-pane-open="true"\][\s\S]*:is\(\[data-page-side-pane-panel\], \[data-page-side-pane-side-header\]\)[\s\S]*box-shadow: -6px 0 16px -12px/,
    )
    assert.match(source, /var\(--side-pane-shadow-color\)/)
  })

  test("the docked AI chat sidebar uses the same light elevation", async () => {
    const [styles, rightSidebars] = await Promise.all([
      readSource("/src/shared/styles/global.css"),
      readSource("/src/app/shell/side-panel/right-sidebars.tsx"),
    ])

    assert.match(rightSidebars, /data-ai-chat-sidebar-panel/)
    assert.match(
      styles,
      /\.light \[data-ai-chat-sidebar-panel\]\[aria-hidden="false"\][\s\S]*box-shadow: -6px 0 16px -12px var\(--side-pane-shadow-color\)/,
    )
  })
}
