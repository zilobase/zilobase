export function register({ readSource, assert, test }) {
  test("block and dragged text selection use one transparent tint", async () => {
    const [editorCss, editorChromeCss, editorChrome, databaseCss, tokens] =
      await Promise.all([
        readSource("/src/features/editor/styles/editor.css"),
        readSource("/src/features/editor/styles/editor-chrome.css"),
        readSource("/src/features/editor/composition/editor-chrome.tsx"),
        readSource("/src/features/databases/styles/database.css"),
        readSource("/src/shared/styles/color-tokens.css"),
      ])
    const css = `${editorCss}\n${editorChromeCss}\n${databaseCss}`

    assert.match(
      css,
      /\.editor-block-selection:not\(table\),[\s\S]*?\)::after \{[\s\S]*?background-color: var\(--zb-color-selection-background-editor\);[\s\S]*?pointer-events: none;[\s\S]*?z-index: 1000;/
    )
    assert.match(
      css,
      /background-color: var\(--zb-color-selection-background-editor\);\s*border-radius: var\(--radius-sm\);/
    )
    assert.match(
      tokens,
      /--zb-color-selection-background-editor: color-mix\(in srgb, var\(--zb-color-action-ring-focus\) 14%, transparent\);/,
    )
    assert.match(
      tokens,
      /\.dark \{[\s\S]*?--zb-color-selection-background-editor: color-mix\(in srgb, var\(--zb-color-action-ring-focus\) 22%, transparent\);/,
    )
    assert.match(
      css,
      /\.tiptap-editor \*::selection \{\s*background-color: var\(--zb-color-selection-background-editor\);\s*color: inherit;/
    )
    assert.match(
      css,
      /\.tiptap-editor \*::-moz-selection \{\s*background-color: var\(--zb-color-selection-background-editor\);\s*color: inherit;/
    )
    assert.match(
      editorChromeCss,
      /\.block-drag-drop-line\[data-orientation="horizontal"\] \{\s*background-color: var\(--zb-color-selection-background-editor\);\s*border-radius: var\(--radius-sm\);\s*height: var\(--spacing\);\s*transform: translateY\(-50%\);/
    )
    assert.match(
      editorCss,
      /\.tiptap-editor > \* \+ \* \{\s*margin-top: var\(--spacing\);/
    )
    assert.match(
      editorChrome,
      /left: blockDropLine\.left,[\s\S]*?width: Math\.max\(0, blockDropLine\.right - blockDropLine\.left\)/,
    )
    assert.match(
      databaseCss,
      /\.database-list-row\[data-drop-before="true"\]::before,[\s\S]*?\.database-list-row\[data-drop-after="true"\]::after \{[\s\S]*?background-color: var\(--zb-color-selection-background-editor\);[\s\S]*?border-radius: var\(--radius-sm\);[\s\S]*?height: var\(--spacing\);/,
    )
    assert.match(
      databaseCss,
      /\.database-gallery-card\[data-drop-before="true"\]::before,[\s\S]*?\.database-gallery-card\[data-drop-after="true"\]::after \{[\s\S]*?background-color: var\(--zb-color-selection-background-editor\);[\s\S]*?border-radius: var\(--radius-sm\);[\s\S]*?height: var\(--spacing\);/,
    )
    assert.match(
      databaseCss,
      /\.database-kanban-card\[data-drop-before="true"\]::before \{[\s\S]*?background-color: var\(--zb-color-selection-background-editor\);[\s\S]*?height: var\(--spacing\);[\s\S]*?transform: translateY\(-50%\);/,
    )
    assert.match(
      databaseCss,
      /\.drag-drop-line\.database-kanban-card-drop-line\[data-orientation="horizontal"\] \{[\s\S]*?background-color: var\(--zb-color-selection-background-editor\);[\s\S]*?height: var\(--spacing\);[\s\S]*?transform: translateY\(-50%\);/,
    )
    assert.match(
      databaseCss,
      /\.drag-drop-line\.database-row-drop-line\[data-orientation="horizontal"\] \{[\s\S]*?background-color: var\(--zb-color-selection-background-editor\);[\s\S]*?height: var\(--spacing\);[\s\S]*?transform: translateY\(-50%\);/,
    )
  })

  test("task list selection uses the shared overlay with even first-row geometry", async () => {
    const [editorCss, databaseCss] = await Promise.all([
      readSource("/src/features/editor/styles/editor.css"),
      readSource("/src/features/databases/styles/database.css"),
    ])
    const css = `${editorCss}\n${databaseCss}`

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
    assert.match(css, /\.tiptap-editor > \* \+ \* \{\s*margin-top: var\(--spacing\);/)
    assert.doesNotMatch(
      css,
      /ProseMirror-hideselection[\s\S]*?\+ \.editor-block-selection::after/
    )
  })

  test("database selection does not restyle any database content", async () => {
    const [editorCss, databaseCss] = await Promise.all([
      readSource("/src/features/editor/styles/editor.css"),
      readSource("/src/features/databases/styles/database.css"),
    ])
    const css = `${editorCss}\n${databaseCss}`

    assert.match(
      css,
      /\.node-databaseBlock\.editor-block-selection[\s\S]*?\.database-inline-scroll-content[\s\S]*?\.database-table,[\s\S]*?\.database-kanban-board[\s\S]*?\)[\s\S]*?\)::after \{[\s\S]*?background-color: var\(--zb-color-selection-background-editor\);/
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
      readSource("/src/features/meetings/styles/meeting.css"),
      readSource("/src/features/editor/extensions/meeting/meeting-extension.tsx"),
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
