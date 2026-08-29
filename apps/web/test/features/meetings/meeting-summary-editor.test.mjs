export function register({ readSource, assert, test }) {
  test("all meeting content uses one collaborative rich-text editor", async () => {
    const [
      summaryEditorSource,
      meetingViewSource,
      meetingPageSource,
      editorStyles,
      extensionSource,
      editorExtensionHookSource,
      meetingCollaborationSource,
    ] = await Promise.all([
        readSource("/src/features/editor/extensions/meeting/meeting-collaborative-editor.tsx"),
        readSource("/src/features/editor/extensions/meeting/meeting-view.tsx"),
        readSource("/src/features/meetings/pages/meeting.tsx"),
        readSource("/src/features/editor/styles.css"),
        readSource("/src/features/editor/runtime/create-base-extensions.ts"),
        readSource("/src/features/editor/runtime/use-editor-extensions.ts"),
        readSource("/src/features/editor/extensions/meeting/use-meeting-collaboration.ts"),
      ])

    assert.match(summaryEditorSource, /import \{ Editor \}/)
    assert.match(summaryEditorSource, /collaborationField=\{field\}/)
    assert.match(summaryEditorSource, /user,\s+users: \[\]/)
    assert.match(summaryEditorSource, /databaseEditable=\{editable\}/)
    assert.match(summaryEditorSource, /editorTabIndex=\{0\}/)
    assert.match(summaryEditorSource, /onPointerDownCapture=\{focusNestedEditor\}/)
    assert.match(summaryEditorSource, /pageId=\{pageId\}/)
    assert.match(meetingViewSource, /const transcriptEditable = editable/)
    assert.match(meetingViewSource, /editable=\{transcriptEditable\}/)
    assert.match(meetingViewSource, /livePreview=\{transcriptPreview\}/)
    assert.match(
      meetingViewSource,
      /useMeetingCollaboration\(meetingId, session\?\.user\)/,
    )
    assert.match(meetingViewSource, /user=\{collaboration\.user\}/)
    assert.match(
      meetingCollaborationSource,
      /setAwarenessField\("user", collaborationUser\)/,
    )
    assert.match(meetingCollaborationSource, /autoConnect: false/)
    assert.match(meetingCollaborationSource, /activeProvider\.connect\(\)/)
    assert.match(
      meetingViewSource,
      /collaboration\.document && collaboration\.provider && collaboration\.user/,
    )
    assert.match(meetingViewSource, /resolveMeetingTranscriptPreview/)
    assert.doesNotMatch(meetingViewSource, /LiveTranscriptDraft/)
    assert.match(summaryEditorSource, /"notes" \| "summary" \| "transcript"/)
    assert.match(meetingViewSource, /field=\{activeTab\}/)
    assert.match(meetingViewSource, /pageId=\{meeting\.pageId\}/)
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
    assert.match(
      editorExtensionHookSource,
      /collaboration\?\.provider && collaboration\.user \? "presence" : "content-only"/,
    )
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
