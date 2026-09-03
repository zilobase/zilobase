export function register({ readSource, assert, test }) {
  const readToolbarSource = async () =>
    (await Promise.all([
      readSource("/src/features/databases/views/view/database-view-toolbar.tsx"),
      readSource("/src/features/databases/views/view/database-view-toolbar-dialogs.tsx"),
    ])).join("\n")
  test("inline database and meeting titles use editor heading two typography", async () => {
    const appStyles = await readSource("/src/shared/styles/global.css")
    const databaseToolbarSource = await readToolbarSource()
    const meetingSource = await readSource("/src/features/editor/extensions/meeting/meeting-view.tsx")

    for (const source of [databaseToolbarSource, meetingSource]) {
      assert.match(source, /font-semibold leading-tight tracking-normal/)
      assert.match(source, /fullPage \? "text-2xl md:text-2xl" : "text-3xl"/)
      assert.match(source, /data-structural-block-title/)
    }

    assert.match(
      appStyles,
      /:where\(\.database-block-shell, \.meeting-block-shell\)[\s\S]*\[data-structural-block-title\][\s\S]*font-weight: var\(--font-weight-semibold\) !important;/,
    )
  })
}
