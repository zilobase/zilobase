import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("inline database and meeting titles use editor heading two typography", async () => {
    const appStyles = await readFile(
      new URL("../src/App.css", import.meta.url),
      "utf8",
    )
    const databaseToolbarSource = await readFile(
      new URL(
        "../src/editor/extensions/database/views/database-view-toolbar.tsx",
        import.meta.url,
      ),
      "utf8",
    )
    const meetingSource = await readFile(
      new URL("../src/editor/extensions/meeting/meeting-view.tsx", import.meta.url),
      "utf8",
    )

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
