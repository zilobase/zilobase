import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("all meeting content uses one collaborative rich-text editor", async () => {
    const [
      summaryEditorSource,
      meetingViewSource,
      meetingPageSource,
      editorStyles,
      extensionSource,
      editorExtensionHookSource,
    ] = await Promise.all([
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
        readFile(new URL("../src/pages/meeting.tsx", import.meta.url), "utf8"),
        readFile(new URL("../src/editor/styles.css", import.meta.url), "utf8"),
        readFile(
          new URL("../src/editor/create-base-extensions.ts", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../src/editor/use-editor-extensions.ts", import.meta.url),
          "utf8",
        ),
      ])

    assert.match(summaryEditorSource, /import \{ Editor \}/)
    assert.match(summaryEditorSource, /collaborationField=\{field\}/)
    assert.match(meetingViewSource, /const transcriptEditable = editable/)
    assert.match(meetingViewSource, /editable=\{transcriptEditable\}/)
    assert.match(meetingViewSource, /livePreview=\{transcriptPreview\}/)
    assert.match(meetingViewSource, /resolveMeetingTranscriptPreview/)
    assert.doesNotMatch(meetingViewSource, /LiveTranscriptDraft/)
    assert.match(summaryEditorSource, /"notes" \| "summary" \| "transcript"/)
    assert.match(meetingViewSource, /field=\{activeTab\}/)
    assert.match(meetingViewSource, /setActiveTab\("summary"\)/)
    assert.match(
      meetingViewSource,
      /TabsTrigger[\s\S]*?className="h-8 shrink-0 grow-0 gap-2 px-3 capitalize"/,
    )
    assert.doesNotMatch(meetingViewSource, /useMeetingTranscript/)
    assert.doesNotMatch(meetingViewSource, /MeetingNotesEditor/)
    assert.match(extensionSource, /field: collaborationField/)
    assert.match(
      extensionSource,
      /MeetingBlock\.configure\(\{[\s\S]*?editorRuntime: databaseEditorRuntime/,
    )
    assert.match(editorExtensionHookSource, /collaborationField \?\? "default"/)
    assert.match(meetingPageSource, /PageMetadata as PageMetadataHeader/)
    assert.match(meetingPageSource, /onCoverChange=/)
    assert.match(meetingPageSource, /onIconChange=/)
    assert.match(meetingPageSource, /showTitle=\{false\}/)
    assert.match(
      editorStyles,
      /\.meeting-block-shell-full \.meeting-collaborative-editor[\s\S]*margin-left: -3\.5rem/,
    )
    assert.match(
      editorStyles,
      /\.meeting-block-shell-full > \.meeting-block-header \{[\s\S]*@apply mt-6 py-2/,
    )
  })
}
