import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("meeting summaries use the editable full rich-text editor", async () => {
    const [summaryEditorSource, meetingViewSource, extensionSource] =
      await Promise.all([
        readFile(
          new URL(
            "../src/editor/extensions/meeting/meeting-collaborative-editor.tsx",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(
          new URL(
            "../src/editor/extensions/meeting/meeting-view.tsx",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(
          new URL("../src/editor/create-base-extensions.ts", import.meta.url),
          "utf8",
        ),
      ])

    assert.match(summaryEditorSource, /import \{ Editor \}/)
    assert.match(summaryEditorSource, /collaborationField=\{field\}/)
    assert.match(meetingViewSource, /editable=\{editable\}/)
    assert.match(meetingViewSource, /field="summary"/)
    assert.match(meetingViewSource, /setActiveTab\("summary"\)/)
    assert.match(extensionSource, /field: collaborationField/)
  })
}
