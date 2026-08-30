export function register({ readSource, assert, test }) {
  test("embedded page dialogs share the dark side-pane surface", async () => {
    const dialog = await readSource(
      "/src/features/pages/components/embedded-page-dialog.tsx",
    )

    assert.match(dialog, /data-page-dialog-panel/)
    assert.match(dialog, /dark:bg-surface-navigation/)
  })

  test("embedded database headers share their containing pane surface", async () => {
    const styles = await readSource(
      "/src/features/databases/styles/database.css",
    )

    assert.match(
      styles,
      /:is\(\[data-page-side-pane-panel\], \[data-page-dialog-panel\]\)[\s\S]*\.database-table-sticky-header[\s\S]*dark:bg-surface-navigation/,
    )
  })
}
