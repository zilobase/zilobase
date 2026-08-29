import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("light side panes cast one continuous shadow through the top bar", async () => {
    const source = await readFile(
      new URL("../src/App.css", import.meta.url),
      "utf8",
    )

    assert.match(
      source,
      /\.light[\s\S]*\[data-page-side-pane-open="true"\][\s\S]*:is\(\[data-page-side-pane-panel\], \[data-page-side-pane-side-header\]\)[\s\S]*box-shadow: -6px 0 16px -12px/,
    )
    assert.match(source, /var\(--side-pane-shadow-color\)/)
  })

  test("the docked AI chat sidebar uses the same light elevation", async () => {
    const [styles, rightSidebars] = await Promise.all([
      readFile(new URL("../src/App.css", import.meta.url), "utf8"),
      readFile(new URL("../src/components/right-sidebars.tsx", import.meta.url), "utf8"),
    ])

    assert.match(rightSidebars, /data-ai-chat-sidebar-panel/)
    assert.match(
      styles,
      /\.light \[data-ai-chat-sidebar-panel\]\[aria-hidden="false"\][\s\S]*box-shadow: -6px 0 16px -12px var\(--side-pane-shadow-color\)/,
    )
  })
}
