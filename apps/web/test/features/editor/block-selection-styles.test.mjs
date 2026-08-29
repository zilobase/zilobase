export function register({ readSource, assert, test }) {
  test("block and dragged text selection use one transparent tint", async () => {
    const [css, tokens] = await Promise.all([
      readSource("/src/editor/styles.css"),
      readSource("/src/styles/design-tokens.css"),
    ])

    assert.match(
      css,
      /\.editor-block-selection:not\(table\),[\s\S]*?\)::after \{[\s\S]*?background-color: var\(--editor-selection-overlay\);[\s\S]*?pointer-events: none;[\s\S]*?z-index: 1000;/
    )
    assert.match(
      css,
      /background-color: var\(--editor-selection-overlay\);\s*border-radius: var\(--radius-sm\);/
    )
    assert.match(
      tokens,
      /--editor-selection-overlay: color-mix\(\s*in oklab,\s*var\(--action-primary\) 13%,\s*transparent\s*\);/,
    )
    assert.match(
      tokens,
      /\.dark \{[\s\S]*?--editor-selection-overlay: color-mix\(\s*in oklab,\s*var\(--action-primary\) 23%,\s*transparent\s*\);/,
    )
    assert.match(
      css,
      /\.tiptap-editor \*::selection \{\s*background-color: var\(--editor-selection-overlay\);\s*color: inherit;/
    )
    assert.match(
      css,
      /\.tiptap-editor \*::-moz-selection \{\s*background-color: var\(--editor-selection-overlay\);\s*color: inherit;/
    )
  })

  test("task list selection uses the shared overlay with even first-row geometry", async () => {
    const css = await readSource("/src/editor/styles.css")

    assert.match(
      css,
      /\.editor-block-selection:not\(table\),[\s\S]*?\)::after \{[\s\S]*?z-index: 1000;/
    )
    assert.match(css, /\.tiptap-editor :where\(\s*\.editor-block-selection/)
    assert.match(
      css,
      /> :is\(li, \.node-taskItem\)\.editor-block-selection:first-child::after \{\s*top: -0\.25rem;/
    )
    const paddedBlockRule = css.match(
      /\/\* Spacing hierarchy[\s\S]*?@apply pb-0\.5;\s*\}/
    )?.[0]

    assert.ok(paddedBlockRule)
    assert.doesNotMatch(paddedBlockRule, /\bul,|\bol,/)
    assert.match(css, /\.tiptap-editor > \* \+ \* \{\s*@apply mt-1;/)
    assert.doesNotMatch(
      css,
      /ProseMirror-hideselection[\s\S]*?\+ \.editor-block-selection::after/
    )
  })

  test("database selection does not restyle any database content", async () => {
    const css = await readSource("/src/editor/styles.css")

    assert.match(
      css,
      /\.node-databaseBlock\.editor-block-selection[\s\S]*?\.database-inline-scroll-content[\s\S]*?\.database-table,[\s\S]*?\.database-kanban-board[\s\S]*?\)[\s\S]*?\)::after \{[\s\S]*?background-color: var\(--editor-selection-overlay\);/
    )
    assert.match(
      css,
      /\.node-databaseBlock\.editor-block-selection:has\([\s\S]*?\.database-inline-scroll-wrap\[data-inline-scroll="true"\][\s\S]*?\)::after \{\s*display: none;/
    )
    assert.doesNotMatch(css, /editor-block-selection[^{]*database-new-button/)
    assert.doesNotMatch(css, /editor-block-selection[^{]*\[data-slot="tabs-tab"\]/)
  })

  test("outer meeting selection uses one overlaid block with standard spacing", async () => {
    const [css, meetingExtension] = await Promise.all([
      readSource("/src/editor/styles.css"),
      readSource("/src/editor/extensions/meeting/meeting-extension.tsx"),
    ])

    assert.match(
      css,
      /\.tiptap-editor \.node-meetingBlock \{\s*@apply min-w-0;/
    )
    assert.doesNotMatch(
      css,
      /\.tiptap-editor \.node-meetingBlock \{\s*@apply[^;]*\bmy-4\b/
    )
    assert.match(
      css,
      /\.node-meetingBlock\.editor-block-selection \{\s*box-sizing: border-box;\s*display: block;\s*width: 100%;/
    )
    assert.doesNotMatch(
      css,
      /\.node-meetingBlock\.editor-block-selection[^{]*> \[data-node-view-wrapper\][^{]*> \.meeting-block-shell/
    )
    assert.match(meetingExtension, /selection instanceof AllSelection/)
    assert.match(meetingExtension, /selection instanceof NodeSelection/)
    assert.match(meetingExtension, /TextSelection\.near\(doc\.resolve\(pos\), -1\)/)
    assert.match(meetingExtension, /onFocusCapture=/)
    assert.match(meetingExtension, /onPointerDownCapture=/)
  })
}
