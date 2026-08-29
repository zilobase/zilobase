export function register({ readSource, assert, test }) {
  test("radius tokens share one source of truth and one concentric step", async () => {
    const css = await readSource("/src/styles/design-tokens.css")

    const radiusSources = [...css.matchAll(/^\s*--radius:\s*([^;]+);/gm)]

    assert.equal(radiusSources.length, 1)
    assert.ok(radiusSources[0][1].trim())
    assert.match(css, /--radius-round:\s*999px;/)
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
    assert.match(css, /--radius-full:\s*var\(--radius-round\);/)
  })

  test("shared nested controls use adjacent concentric radius tokens", async () => {
    const [tabs, dropdown, contextMenu] = await Promise.all(
      ["tabs", "dropdown-menu", "context-menu"].map((component) =>
        readSource(`/src/components/ui/${component}.tsx`),
      ),
    )

    assert.match(tabs, /rounded-lg bg-muted p-1/)
    assert.match(tabs, /rounded-md bg-background/)
    for (const menu of [dropdown, contextMenu]) {
      assert.match(menu, /rounded-lg[^"\n]*p-1/)
      assert.match(menu, /data-slot="[^"]+-item"[\s\S]*?rounded-md/)
    }
  })

  test("sidebar rows, tabs, and buttons share the control radius", async () => {
    const [button, sidebar, sidebarAction, sectionMenu, tabs] =
      await Promise.all(
        [
          "ui/button",
          "ui/sidebar",
          "sidebar-nav-item-action",
          "sidebar-section-menu",
          "ui/tabs",
        ].map((component) =>
          readSource(`/src/components/${component}.tsx`),
        ),
      )

    assert.match(button, /group\/button[^"\n]*rounded-md/)
    assert.doesNotMatch(button, /rounded-sm/)
    assert.match(sidebar, /peer\/menu-button[^"\n]*rounded-md/)
    assert.doesNotMatch(sidebar, /rounded-\[calc\(var\(--radius-sm\)/)
    assert.match(sidebarAction, /rounded-md/)
    assert.match(sectionMenu, /rounded-md/)
    assert.match(tabs, /relative inline-flex[^"\n]*rounded-md/)
  })

  test("rectangular badges and pills share the control radius", async () => {
    const [badge, editorStyles, discussions, contextChips, toolbar] =
      await Promise.all(
        [
          "components/ui/badge.tsx",
          "editor/styles.css",
          "components/discussions-sidebar.tsx",
          "components/ai-elements/context-attach-chips.tsx",
          "editor/extensions/database/views/database-view-toolbar.tsx",
        ].map((path) =>
          readSource(`/src/${path}`),
        ),
      )

    assert.match(badge, /group\/badge[^"\n]*rounded-md/)
    assert.match(editorStyles, /\.database-select-badge \{\s*@apply[^;]*rounded-md/)
    assert.match(editorStyles, /\.database-page-open \{\s*@apply[^;]*rounded-md/)
    assert.doesNotMatch(discussions, /rounded-full[^"\n]*px-/)
    assert.match(contextChips, /h-7[^"\n]*rounded-md/)
    assert.doesNotMatch(toolbar, /h-8 shrink-0 rounded-full px-3/)
  })
}
