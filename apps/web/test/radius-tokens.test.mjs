import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("radius tokens share one source of truth and one concentric step", async () => {
    const css = await readFile(
      new URL("../src/styles/design-tokens.css", import.meta.url),
      "utf8",
    )

    assert.match(css, /--radius:\s*0\.75rem;/)
    assert.match(
      css,
      /--radius-md:\s*max\(0px, calc\(var\(--radius\) - var\(--spacing\)\)\);/,
    )
    assert.match(css, /--radius-lg:\s*var\(--radius\);/)
    assert.match(
      css,
      /--radius-xl:\s*calc\(var\(--radius\) \+ var\(--spacing\)\);/,
    )
    assert.doesNotMatch(css, /--radius-(?:2xl|3xl|4xl):[^;]*var\(--radius\) \*/)
  })

  test("shared nested controls use adjacent concentric radius tokens", async () => {
    const [tabs, menubar, dropdown, contextMenu] = await Promise.all(
      ["tabs", "menubar", "dropdown-menu", "context-menu"].map((component) =>
        readFile(
          new URL(`../src/components/ui/${component}.tsx`, import.meta.url),
          "utf8",
        ),
      ),
    )

    assert.match(tabs, /rounded-lg bg-muted p-1/)
    assert.match(tabs, /rounded-md bg-background/)
    assert.match(menubar, /rounded-lg border p-1/)
    assert.match(menubar, /data-slot="menubar-trigger"[\s\S]*rounded-md/)

    for (const menu of [dropdown, contextMenu]) {
      assert.match(menu, /rounded-lg[^"\n]*p-1/)
      assert.match(menu, /data-slot="[^"]+-item"[\s\S]*?rounded-md/)
    }
  })
}
