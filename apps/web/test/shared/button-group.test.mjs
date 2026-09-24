export function register({ assert, loadModule, readSource, test }) {
  test("button groups expose shared layout variants instead of feature styles", async () => {
    const { buttonGroupItemVariants, buttonGroupVariants } = await loadModule(
      "/apps/web/src/shared/ui/button-group.tsx",
    )

    const connected = buttonGroupVariants({ variant: "connected" })
    assert.match(connected, /rounded-l-none/)
    assert.match(connected, /border-l-0/)

    const floating = buttonGroupVariants({ variant: "floating" })
    assert.match(floating, /bg-surface-overlay/)
    assert.match(floating, /shadow-lg/)
    assert.match(floating, /gap-1/)

    const selection = buttonGroupVariants({ variant: "selection" })
    assert.match(selection, /button-group-item/)
    assert.match(selection, /border-r-stroke-default/)
    assert.doesNotMatch(selection, /h-9|text-sm|px-3/)
    assert.match(buttonGroupItemVariants({ layout: "icon" }), /size-7/)

    assert.match(buttonGroupVariants({ width: "full" }), /w-full/)
  })

  test("editor and database toolbars select shared button group variants", async () => {
    const [selectionBubbleMenu, databaseSelectionToolbar, editorStyles] =
      await Promise.all([
        readSource(
          "/src/features/editor/selection/selection-bubble-menu.tsx",
        ),
        readSource(
          "/src/features/databases/views/table/components/database-table-selection-toolbar.tsx",
        ),
        readSource("/src/features/editor/styles/editor-chrome.css"),
      ])

    assert.match(selectionBubbleMenu, /variant="floating"/)
    assert.match(databaseSelectionToolbar, /variant="selection"/)
    assert.match(databaseSelectionToolbar, /ButtonGroupItem/)
    assert.doesNotMatch(editorStyles, /\.selection-toolbar\s*\{/)
  })
}
